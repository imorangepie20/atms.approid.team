-- [F01/F08-13 추가] 기존 회사/기간은 보존하고 열과 제약만 추가한다.
-- 기존 기간이 366일을 초과하면 검증에서 실패한다. 이 파일은 기존 데이터를 고치지 않는다.
BEGIN;
ALTER TABLE "companies"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "creation_request_id" UUID,
  ADD COLUMN "creation_input_hash" CHAR(64),
  ADD CONSTRAINT "company_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "company_creation_complete" CHECK (
    ("created_by_id" IS NULL AND "creation_request_id" IS NULL AND "creation_input_hash" IS NULL)
    OR ("created_by_id" IS NOT NULL AND "creation_request_id" IS NOT NULL AND "creation_input_hash" IS NOT NULL)),
  ADD CONSTRAINT "company_creation_hash" CHECK ("creation_input_hash" IS NULL OR "creation_input_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "companies_created_by_id_creation_request_id_key" ON "companies"("created_by_id", "creation_request_id");
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_year_input_span" CHECK ("end_date" - "start_date" + 1 BETWEEN 1 AND 366);
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'REAUTH_SUCCEEDED', 'REAUTH_FAILED', 'ACCESS_DENIED',
  'ACCOUNT_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MAIL_FAILED',
  'COMPANY_CREATED', 'COMPANY_RENAMED', 'FISCAL_YEAR_CREATED'
));
COMMIT;
