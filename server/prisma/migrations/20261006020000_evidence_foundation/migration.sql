-- [F03 승인 E1~E8] 기존 데이터/SQL은 수정하지 않고 완료 증빙과 미완성 예약을 추가한다.
BEGIN;
CREATE TYPE "EvidenceKind" AS ENUM ('RECEIPT','TAX_INVOICE','OTHER');
CREATE TYPE "EvidenceUploadState" AS ENUM ('PENDING','FAILED','READY','CLEANING','EXPIRED');
CREATE TABLE "evidence_uploads" (
  "id" UUID PRIMARY KEY,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "creation_request_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "input_hash" CHAR(64) NOT NULL CHECK ("input_hash" ~ '^[a-f0-9]{64}$'),
  "state" "EvidenceUploadState" NOT NULL DEFAULT 'PENDING',
  "attempt_id" UUID NOT NULL,
  "attempts" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("attempts")='array'),
  "failure_code" TEXT CHECK ("failure_code" IS NULL OR "failure_code" IN ('SCAN_REJECTED','SCAN_UNAVAILABLE','STORAGE_UNAVAILABLE','COMMIT_FAILED','EXPIRED')),
  "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "evidence_uploads_company_id_creation_request_id_key" ON "evidence_uploads"("company_id","creation_request_id");
CREATE UNIQUE INDEX "evidence_uploads_company_id_id_key" ON "evidence_uploads"("company_id","id");
CREATE INDEX "evidence_uploads_state_last_activity_at_idx" ON "evidence_uploads"("state","last_activity_at");
CREATE TABLE "evidences" (
  "id" UUID PRIMARY KEY,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "upload_id" UUID NOT NULL,
  "kind" "EvidenceKind" NOT NULL,
  "title" TEXT NOT NULL CHECK (char_length("title") BETWEEN 1 AND 100 AND "title"=btrim("title")),
  "occurred_on" DATE,
  "counterparty_id" UUID,
  "original_file_name" TEXT NOT NULL CHECK (char_length("original_file_name") BETWEEN 1 AND 200),
  "media_type" TEXT NOT NULL CHECK ("media_type" IN ('application/pdf','image/jpeg','image/png')),
  "byte_size" INTEGER NOT NULL CHECK ("byte_size" BETWEEN 1 AND 10485760),
  "sha256" CHAR(64) NOT NULL CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  "original_key" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidences_company_upload_fkey" FOREIGN KEY("company_id","upload_id") REFERENCES "evidence_uploads"("company_id","id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "evidences_company_counterparty_fkey" FOREIGN KEY("company_id","counterparty_id") REFERENCES "counterparties"("company_id","id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "evidences_company_id_id_key" ON "evidences"("company_id","id");
CREATE UNIQUE INDEX "evidences_company_id_upload_id_key" ON "evidences"("company_id","upload_id");
CREATE UNIQUE INDEX "evidences_original_key_key" ON "evidences"("original_key");
-- 완료 행은 수정/삭제하지 않는다. 시험 fixture 삭제는 별도 시험 DB를 제거하여 수행한다.
CREATE FUNCTION evidence_preserve_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Completed evidence is immutable'; END $$;
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON "evidences" FOR EACH ROW EXECUTE FUNCTION evidence_preserve_original();
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED'
));
COMMIT;
