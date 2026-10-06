CREATE TABLE "app_metadata" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_metadata_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_metadata" ("key", "value") VALUES ('environment_schema', '1');
