-- CreateTable
CREATE TABLE "login_rate_buckets" (
    "id" CHAR(64) NOT NULL,
    "attempts" TIMESTAMPTZ(3)[],
    "blocked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_rate_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID,
    "company_id" UUID,
    "type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_company_id_created_at_idx" ON "audit_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");

-- [F01/F08-13 추가] 최근 시도 배열과 감사 자료의 최소 구조를 DB에서도 검사한다.
ALTER TABLE "login_rate_buckets" ALTER COLUMN "attempts" SET NOT NULL;
ALTER TABLE "login_rate_buckets" ADD CONSTRAINT "login_rate_bucket_key" CHECK ("id" ~ '^[0-9a-f]{64}$');
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_type_known" CHECK ("type" IN ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'REAUTH_SUCCEEDED', 'REAUTH_FAILED', 'ACCESS_DENIED'));
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_details_object" CHECK (jsonb_typeof("details") = 'object');
