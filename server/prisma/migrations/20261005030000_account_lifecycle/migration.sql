-- [F01/F08-13 추가] 기존 테이블·마이그레이션은 보존하고 일회용 토큰과 신규 감사 유형만 추가한다.
CREATE TABLE "user_action_tokens" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "purpose" TEXT NOT NULL,
  "token_hash" CHAR(64) NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "invalidated_at" TIMESTAMPTZ(3),
  CONSTRAINT "action_token_purpose" CHECK ("purpose" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
  CONSTRAINT "action_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "action_token_times" CHECK ("expires_at" > "created_at"
    AND ("used_at" IS NULL OR ("used_at" >= "created_at" AND "used_at" < "expires_at"))
    AND ("invalidated_at" IS NULL OR "invalidated_at" >= "created_at")),
  CONSTRAINT "action_token_single_terminal_state" CHECK ("used_at" IS NULL OR "invalidated_at" IS NULL)
);
CREATE INDEX "user_action_tokens_user_id_purpose_idx" ON "user_action_tokens"("user_id", "purpose");
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_type_known";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN (
  'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'REAUTH_SUCCEEDED', 'REAUTH_FAILED', 'ACCESS_DENIED',
  'ACCOUNT_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MAIL_FAILED'
));
