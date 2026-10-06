-- [F04-01 승인 A3/A4/A6] 기존 계정의 ID/회사/코드/이름/active/템플릿 참조를 그대로 둔다.
-- 분류와 생성 요청은 추정하지 않는다. nullable 쌍+version=1만 추가한다.
BEGIN;
CREATE TYPE "AccountCategory" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
CREATE TYPE "AccountNormalBalance" AS ENUM ('DEBIT','CREDIT');
ALTER TABLE "company_accounts"
  ADD COLUMN "category" "AccountCategory",
  ADD COLUMN "normal_balance" "AccountNormalBalance",
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "creation_request_id" UUID,
  ADD COLUMN "creation_input_hash" CHAR(64),
  ADD CONSTRAINT "account_classification_pair" CHECK ((category IS NULL) = (normal_balance IS NULL)),
  ADD CONSTRAINT "account_version_positive" CHECK (version > 0),
  ADD CONSTRAINT "account_creation_pair" CHECK ((creation_request_id IS NULL) = (creation_input_hash IS NULL)),
  ADD CONSTRAINT "account_creation_hash" CHECK (creation_input_hash IS NULL OR creation_input_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "account_new_input" CHECK (creation_request_id IS NULL OR
    (category IS NOT NULL AND normal_balance IS NOT NULL AND code ~ '^[A-Z0-9_-]{1,20}$' AND char_length(name) BETWEEN 1 AND 100));
CREATE UNIQUE INDEX "company_accounts_company_id_creation_request_id_key" ON "company_accounts"("company_id","creation_request_id");
-- [A7] 기존 감사 사건을 모두 유지하고 승인된 새 사건3개만 추가한다.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','LOGOUT_ALL','REAUTH_SUCCEEDED','REAUTH_FAILED','ACCESS_DENIED',
  'ACCOUNT_REGISTERED','EMAIL_VERIFIED','PASSWORD_RESET','PASSWORD_CHANGED','MAIL_FAILED',
  'COMPANY_CREATED','COMPANY_RENAMED','FISCAL_YEAR_CREATED','MEMBER_ROLES_CHANGED','MEMBERSHIP_DEACTIVATED',
  'INVITATION_CREATED','INVITATION_CANCELLED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_MAIL_FAILED',
  'ACCESS_REQUEST_CREATED','ACCESS_REQUEST_CANCELLED','ACCESS_REQUEST_APPROVED','ACCESS_REQUEST_REJECTED','COMPANY_ACCESS_EXPIRED',
  'COMPANY_SELF_APPROVAL_CHANGED','COUNTERPARTY_CREATED','COUNTERPARTY_UPDATED','COUNTERPARTY_DEACTIVATED','EVIDENCE_REGISTERED',
  'ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DEACTIVATED'
));
COMMIT;
