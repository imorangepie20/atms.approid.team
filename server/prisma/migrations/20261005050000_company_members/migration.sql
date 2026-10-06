-- [F01/F08-13 추가] 기존 소속/역할은 보존하고 버전 및 고정 감사 유형만 추가한다.
-- 마지막 관리자 보호는 회사 전체 집계가 필요하므로 서비스 트랜잭션의 회사 잠금에서 수행한다.
BEGIN;
ALTER TABLE "company_memberships" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "membership_version_positive" CHECK ("version" > 0);
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'REAUTH_SUCCEEDED', 'REAUTH_FAILED', 'ACCESS_DENIED',
  'ACCOUNT_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MAIL_FAILED',
  'COMPANY_CREATED', 'COMPANY_RENAMED', 'FISCAL_YEAR_CREATED', 'MEMBER_ROLES_CHANGED', 'MEMBERSHIP_DEACTIVATED'
));
COMMIT;
