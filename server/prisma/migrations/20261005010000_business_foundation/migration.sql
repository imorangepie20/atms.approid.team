-- [F08-11 추가] 기반 모델의 새 마이그레이션. 기존 테이블·데이터를 삭제하지 않는다.
-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('COMPANY_ADMIN', 'ACCOUNTANT', 'APPROVER', 'READ_ONLY', 'EXTERNAL_TAX');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'KRW',
    "allow_self_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_memberships" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_member_roles" (
    "company_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role" "CompanyRole" NOT NULL,

    CONSTRAINT "company_member_roles_pkey" PRIMARY KEY ("company_id","membership_id","role")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "reauthenticated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_development_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "account_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source_template_item_id" UUID,

    CONSTRAINT "company_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE INDEX "company_memberships_user_id_idx" ON "company_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_company_id_user_id_key" ON "company_memberships"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_company_id_id_key" ON "company_memberships"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_absolute_expires_at_idx" ON "user_sessions"("absolute_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_company_id_start_date_key" ON "fiscal_years"("company_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "account_templates_code_version_key" ON "account_templates"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "account_template_items_template_id_code_key" ON "account_template_items"("template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_accounts_company_id_code_key" ON "company_accounts"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_accounts_company_id_id_key" ON "company_accounts"("company_id", "id");

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "company_member_roles" ADD CONSTRAINT "company_member_roles_company_id_membership_id_fkey" FOREIGN KEY ("company_id", "membership_id") REFERENCES "company_memberships"("company_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account_template_items" ADD CONSTRAINT "account_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "account_templates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_accounts_source_template_item_id_fkey" FOREIGN KEY ("source_template_item_id") REFERENCES "account_template_items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- [F08-11 추가: Prisma 스키마에 직접 표현하지 못하는 DB 제약]
-- btree_gist는 UUID 동등 비교와 날짜 범위 비교를 하나의 배제 제약에서 사용한다.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "companies" ADD CONSTRAINT "companies_currency_krw" CHECK ("currency" = 'KRW');
ALTER TABLE "companies" ADD CONSTRAINT "companies_name_nonempty" CHECK (length(btrim("name")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK ("email_normalized" = lower(btrim("email")) AND length("email_normalized") > 0);
-- 개발 대역 사용자만 해시 없이 중지 상태로 저장한다. 활성 사용자는 후속 인증에서 Argon2id 해시를 발급한다.
ALTER TABLE "users" ADD CONSTRAINT "users_active_password" CHECK ("disabled_at" IS NOT NULL OR "password_hash" IS NOT NULL);
ALTER TABLE "user_sessions" ADD CONSTRAINT "sessions_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$' AND ("csrf_token_hash" IS NULL OR "csrf_token_hash" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "user_sessions" ADD CONSTRAINT "sessions_time_order" CHECK ("created_at" <= "last_activity_at" AND "last_activity_at" < "idle_expires_at" AND "idle_expires_at" <= "absolute_expires_at");
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_year_dates" CHECK ("start_date" <= "end_date");
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_year_no_overlap" EXCLUDE USING gist ("company_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
ALTER TABLE "account_templates" ADD CONSTRAINT "template_valid" CHECK ("version" > 0 AND length(btrim("code")) > 0 AND length(btrim("name")) > 0);
ALTER TABLE "account_template_items" ADD CONSTRAINT "template_item_valid" CHECK (length(btrim("code")) > 0 AND length(btrim("name")) > 0);
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_account_valid" CHECK (length(btrim("code")) > 0 AND length(btrim("name")) > 0);
