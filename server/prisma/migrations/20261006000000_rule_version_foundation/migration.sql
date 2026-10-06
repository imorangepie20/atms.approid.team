-- [F13-01~03 추가] 실제 법률 값 없이 규칙·불변 버전·아티팩트 참조·회사 적용 기간의 기반만 추가한다.
-- 기존 15개 테이블과 행은 수정하지 않는다. 계산 코드 본문은 저장하지 않고 저장소 위치와 SHA-256만 기록한다.
BEGIN;

CREATE TYPE "RuleDomain" AS ENUM ('ACCOUNTING', 'TAX');
CREATE TYPE "RuleArtifactKind" AS ENUM ('CONFIG', 'CALCULATION', 'ACCOUNT_MAPPING', 'FORM');

CREATE TABLE "rule_sets" (
  "id" UUID NOT NULL,
  "domain" "RuleDomain" NOT NULL,
  "jurisdiction" CHAR(2) NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rule_set_identity_valid" CHECK (
    "jurisdiction" ~ '^[A-Z]{2}$' AND "code" ~ '^[A-Z][A-Z0-9_]{1,63}$'
    AND "name" = btrim("name") AND length("name") BETWEEN 1 AND 200
  )
);

CREATE TABLE "rule_versions" (
  "id" UUID NOT NULL,
  "rule_set_id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "official_source_title" TEXT NOT NULL,
  "official_source_url" TEXT NOT NULL,
  "legal_provision" TEXT NOT NULL,
  "promulgated_on" DATE,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "applicable_from" DATE NOT NULL,
  "applicable_to" DATE,
  "company_conditions" JSONB NOT NULL,
  "transitional_provisions" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rule_version_metadata_valid" CHECK (
    "version" = btrim("version") AND length("version") BETWEEN 1 AND 64
    AND "official_source_title" = btrim("official_source_title") AND length("official_source_title") BETWEEN 1 AND 500
    AND "official_source_url" ~ '^https://[^[:space:]]+$' AND length("official_source_url") <= 2000
    AND "legal_provision" = btrim("legal_provision") AND length("legal_provision") BETWEEN 1 AND 500
    AND ("effective_to" IS NULL OR "effective_from" <= "effective_to")
    AND ("applicable_to" IS NULL OR "applicable_from" <= "applicable_to")
    AND jsonb_typeof("company_conditions") = 'object'
    AND jsonb_typeof("transitional_provisions") = 'object'
  )
);

CREATE TABLE "rule_artifact_versions" (
  "id" UUID NOT NULL,
  "rule_version_id" UUID NOT NULL,
  "kind" "RuleArtifactKind" NOT NULL,
  "version" TEXT NOT NULL,
  "repository_locator" TEXT NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rule_artifact_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rule_artifact_reference_valid" CHECK (
    "version" = btrim("version") AND length("version") BETWEEN 1 AND 64
    AND "repository_locator" = btrim("repository_locator") AND length("repository_locator") BETWEEN 1 AND 512
    AND "content_sha256" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("metadata") = 'object'
  )
);

CREATE TABLE "company_rule_applications" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "rule_set_id" UUID NOT NULL,
  "rule_version_id" UUID NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_rule_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_rule_application_dates" CHECK ("effective_to" IS NULL OR "effective_from" <= "effective_to")
);

CREATE UNIQUE INDEX "rule_sets_domain_jurisdiction_code_key" ON "rule_sets"("domain", "jurisdiction", "code");
CREATE UNIQUE INDEX "rule_versions_rule_set_id_version_key" ON "rule_versions"("rule_set_id", "version");
CREATE UNIQUE INDEX "rule_versions_rule_set_id_id_key" ON "rule_versions"("rule_set_id", "id");
CREATE UNIQUE INDEX "rule_artifact_versions_rule_version_id_kind_version_key" ON "rule_artifact_versions"("rule_version_id", "kind", "version");
CREATE UNIQUE INDEX "company_rule_applications_company_id_rule_set_id_effective_from_key" ON "company_rule_applications"("company_id", "rule_set_id", "effective_from");
CREATE INDEX "company_rule_applications_company_id_id_idx" ON "company_rule_applications"("company_id", "id");

ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_rule_set_id_fkey"
  FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "rule_artifact_versions" ADD CONSTRAINT "rule_artifact_versions_rule_version_id_fkey"
  FOREIGN KEY ("rule_version_id") REFERENCES "rule_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "company_rule_applications" ADD CONSTRAINT "company_rule_applications_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "company_rule_applications" ADD CONSTRAINT "company_rule_applications_rule_set_id_fkey"
  FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "company_rule_applications" ADD CONSTRAINT "company_rule_applications_rule_set_id_rule_version_id_fkey"
  FOREIGN KEY ("rule_set_id", "rule_version_id") REFERENCES "rule_versions"("rule_set_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "company_rule_applications" ADD CONSTRAINT "company_rule_application_no_overlap"
  EXCLUDE USING gist ("company_id" WITH =, "rule_set_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&);

-- 회사 적용 기간은 선택한 규칙 버전이 선언한 적용 가능 기간 안에 있어야 한다.
CREATE FUNCTION enforce_rule_application_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_from DATE; version_to DATE;
BEGIN
  SELECT "applicable_from", "applicable_to" INTO version_from, version_to
  FROM "rule_versions" WHERE "rule_set_id" = NEW."rule_set_id" AND "id" = NEW."rule_version_id";
  IF version_from IS NULL OR NEW."effective_from" < version_from
     OR (version_to IS NOT NULL AND (NEW."effective_to" IS NULL OR NEW."effective_to" > version_to)) THEN
    RAISE EXCEPTION 'company rule application is outside the rule version period';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "company_rule_application_period" BEFORE INSERT OR UPDATE ON "company_rule_applications"
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_application_period();

-- 공표된 규칙·아티팩트 버전은 수정하거나 삭제하지 않고 새 버전을 추가한다.
CREATE FUNCTION reject_rule_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'published rule versions are immutable';
END;
$$;
CREATE TRIGGER "rule_versions_immutable" BEFORE UPDATE OR DELETE ON "rule_versions"
  FOR EACH ROW EXECUTE FUNCTION reject_rule_version_mutation();
CREATE TRIGGER "rule_artifact_versions_immutable" BEFORE UPDATE OR DELETE ON "rule_artifact_versions"
  FOR EACH ROW EXECUTE FUNCTION reject_rule_version_mutation();

COMMIT;
