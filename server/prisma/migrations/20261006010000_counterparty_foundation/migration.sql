-- [F02 승인 추가] 기존 테이블/행/과거 SQL은 유지하고 거래처와 고정 감사3종만 추가한다.
BEGIN;
CREATE TYPE "CounterpartyKind" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');
CREATE TABLE "counterparties" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CounterpartyKind" NOT NULL,
  "business_number" VARCHAR(10),
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "memo" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "creation_request_id" UUID NOT NULL,
  "creation_input_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "counterparties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "counterparty_name_length" CHECK (char_length("name") BETWEEN 1 AND 100 AND "name" = btrim("name")),
  CONSTRAINT "counterparty_business_number" CHECK ("business_number" IS NULL OR "business_number" ~ '^[0-9]{10}$'),
  CONSTRAINT "counterparty_version_positive" CHECK ("version" > 0),
  CONSTRAINT "counterparty_input_hash" CHECK ("creation_input_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "counterparty_contact_lengths" CHECK (
    ("contact_name" IS NULL OR char_length("contact_name") BETWEEN 1 AND 100) AND
    ("email" IS NULL OR char_length("email") BETWEEN 1 AND 254) AND
    ("phone" IS NULL OR char_length("phone") BETWEEN 1 AND 40) AND
    ("address" IS NULL OR char_length("address") BETWEEN 1 AND 300) AND
    ("memo" IS NULL OR char_length("memo") BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX "counterparties_company_id_business_number_key" ON "counterparties"("company_id", "business_number");
CREATE UNIQUE INDEX "counterparties_company_id_creation_request_id_key" ON "counterparties"("company_id", "creation_request_id");
CREATE UNIQUE INDEX "counterparties_company_id_id_key" ON "counterparties"("company_id", "id");
-- 코드의 whitelist와 DB 사건 목록을 함께 갱신한다. 실패하면 테이블 생성도 취소된다.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED'
));
COMMIT;
