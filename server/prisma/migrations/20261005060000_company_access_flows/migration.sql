-- [F01 추가 SQL] 기존 6개 마이그레이션/13개 업무 테이블/자료는 수정하지 않는다.
BEGIN;
CREATE TABLE "company_invitations" (
  "id" UUID PRIMARY KEY, "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "email" TEXT NOT NULL, "email_normalized" TEXT NOT NULL, "roles" "CompanyRole"[] NOT NULL,
  "issuer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "version" INTEGER NOT NULL DEFAULT 1,
  "token_hash" CHAR(64) NOT NULL UNIQUE, "token_invalidated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "invitation_status_known" CHECK ("status" IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
  CONSTRAINT "invitation_version_positive" CHECK ("version">0),
  CONSTRAINT "invitation_email_normalized" CHECK ("email_normalized"=lower("email") AND length("email") BETWEEN 3 AND 254),
  CONSTRAINT "invitation_hash_valid" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  -- 다섯 enum 값 중 중복 없는 1~5개. NULL 요소/차원 변형도 허용하지 않는다.
  CONSTRAINT "invitation_roles_valid" CHECK (cardinality("roles") BETWEEN 1 AND 5 AND array_ndims("roles")=1
    AND array_position("roles",NULL) IS NULL AND array_lower("roles",1)=1
    AND cardinality("roles") = (CASE WHEN 'COMPANY_ADMIN'=ANY("roles") THEN 1 ELSE 0 END
      + CASE WHEN 'ACCOUNTANT'=ANY("roles") THEN 1 ELSE 0 END + CASE WHEN 'APPROVER'=ANY("roles") THEN 1 ELSE 0 END
      + CASE WHEN 'READ_ONLY'=ANY("roles") THEN 1 ELSE 0 END + CASE WHEN 'EXTERNAL_TAX'=ANY("roles") THEN 1 ELSE 0 END)),
  CONSTRAINT "invitation_times_valid" CHECK ("expires_at">"created_at" AND "updated_at">="created_at"
    AND ("processed_at" IS NULL OR "processed_at">="created_at")
    AND ("token_invalidated_at" IS NULL OR "token_invalidated_at">="created_at")
    AND (("status"='PENDING' AND "processed_at" IS NULL) OR ("status"<>'PENDING' AND "processed_at" IS NOT NULL)))
);
CREATE INDEX "company_invitations_company_id_id_idx" ON "company_invitations"("company_id","id");
-- 시각은 인덱스에 넣지 않는다. 기한 지난 PENDING은 신규 접수 TX에서 EXPIRED로 전환한다.
CREATE UNIQUE INDEX "invitation_one_pending" ON "company_invitations"("company_id","email_normalized") WHERE "status"='PENDING';
CREATE TABLE "company_access_requests" (
  "id" UUID PRIMARY KEY, "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "requester_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "processor_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "access_request_status_known" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED')),
  CONSTRAINT "access_request_version_positive" CHECK ("version">0),
  CONSTRAINT "access_request_times_valid" CHECK ("expires_at">"created_at" AND "updated_at">="created_at"
    AND ("processed_at" IS NULL OR "processed_at">="created_at")
    AND (("status"='PENDING' AND "processed_at" IS NULL) OR ("status"<>'PENDING' AND "processed_at" IS NOT NULL))),
  CONSTRAINT "access_request_processor_valid" CHECK (("status" IN ('APPROVED','REJECTED') AND "processor_id" IS NOT NULL)
    OR ("status" NOT IN ('APPROVED','REJECTED') AND "processor_id" IS NULL))
);
CREATE INDEX "company_access_requests_company_id_id_idx" ON "company_access_requests"("company_id","id");
CREATE INDEX "company_access_requests_requester_id_id_idx" ON "company_access_requests"("requester_id","id");
CREATE UNIQUE INDEX "access_request_one_pending" ON "company_access_requests"("company_id","requester_id") WHERE "status"='PENDING';
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED'
));
COMMIT;
