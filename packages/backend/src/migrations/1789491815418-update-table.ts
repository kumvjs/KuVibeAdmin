import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTable1789491815418 implements MigrationInterface {
    name = 'UpdateTable1789491815418'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "sys_attachment_audit" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "attachment_id" bigint NOT NULL, "actor_id" bigint, "action" character varying(40) NOT NULL, CONSTRAINT "PK_2934067d1bc58e24ad48114d313" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_attachment_audit_attachment" ON "sys_attachment_audit"  ("attachment_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "sys_attachment" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "owner_id" bigint NOT NULL, "original_name" character varying(255) NOT NULL, "extension" character varying(20) NOT NULL, "mime_type" character varying(127) NOT NULL, "size_bytes" bigint NOT NULL, "sha256" character varying(64) NOT NULL, "storage_driver" character varying(20) NOT NULL, "object_key" character varying(255) NOT NULL, "purpose" character varying(50) NOT NULL, "policy_revision" integer NOT NULL, "visibility" character varying(7) NOT NULL DEFAULT 'private', "status" character varying(8) NOT NULL DEFAULT 'pending', "scan_status" character varying(9) NOT NULL DEFAULT 'unscanned', "expires_at" TIMESTAMP WITH TIME ZONE, "last_error" text, CONSTRAINT "chk_sys_attachment_scan" CHECK ("scan_status" IN ('unscanned', 'clean', 'rejected')), CONSTRAINT "chk_sys_attachment_status" CHECK ("status" IN ('pending', 'ready', 'deleting', 'deleted')), CONSTRAINT "chk_sys_attachment_visibility" CHECK ("visibility" IN ('private', 'public')), CONSTRAINT "chk_sys_attachment_size" CHECK ("size_bytes" >= 0), CONSTRAINT "PK_344afcd6eddec66a888073e6cf6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_attachment_purpose" ON "sys_attachment"  ("purpose") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_attachment_owner" ON "sys_attachment"  ("owner_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_attachment_cleanup" ON "sys_attachment"  ("status", "expires_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_attachment_object" ON "sys_attachment"  ("storage_driver", "object_key") `);
        await queryRunner.query(`CREATE TABLE "sys_attachment_reference" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "attachment_id" bigint NOT NULL, "business_type" character varying(50) NOT NULL, "business_id" character varying(100) NOT NULL, "field" character varying(50) NOT NULL, CONSTRAINT "PK_887cf17fbee5a0ed840a1ddfd41" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_attachment_reference_business" ON "sys_attachment_reference"  ("business_type", "business_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_attachment_reference" ON "sys_attachment_reference"  ("attachment_id", "business_type", "business_id", "field") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE TABLE "sys_upload_policy" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "max_image_width" integer, "max_image_height" integer, "purpose" character varying(50) NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "allowed_formats" jsonb NOT NULL, "max_file_bytes" integer NOT NULL, "max_total_bytes" integer NOT NULL, "max_files" smallint NOT NULL, "visibility" character varying(7) NOT NULL DEFAULT 'private', "retention_seconds" integer NOT NULL, "revision" integer NOT NULL, CONSTRAINT "chk_sys_upload_policy_formats" CHECK (jsonb_typeof("allowed_formats") = 'array' AND jsonb_array_length("allowed_formats") BETWEEN 1 AND 13), CONSTRAINT "chk_sys_upload_policy_visibility" CHECK ("visibility" IN ('private', 'public') AND ("visibility" = 'private' OR "purpose" = 'avatar')), CONSTRAINT "chk_sys_upload_policy_limits" CHECK ("max_file_bytes" > 0 AND "max_total_bytes" >= "max_file_bytes" AND "max_total_bytes" <= 1073741824 AND "max_files" BETWEEN 1 AND 20 AND "retention_seconds" BETWEEN 60 AND 2592000), CONSTRAINT "PK_041aa76a64d932edb6a7570f081" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_upload_policy_purpose" ON "sys_upload_policy"  ("purpose") `);
        await queryRunner.query(`ALTER TABLE "sys_attachment_reference" ADD CONSTRAINT "FK_6672d39969a9748a76943beaa9a" FOREIGN KEY ("attachment_id") REFERENCES "sys_attachment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sys_attachment_reference" DROP CONSTRAINT "FK_6672d39969a9748a76943beaa9a"`);
        await queryRunner.query(`DROP INDEX "public"."uq_sys_upload_policy_purpose"`);
        await queryRunner.query(`DROP TABLE "sys_upload_policy"`);
        await queryRunner.query(`DROP INDEX "public"."uq_sys_attachment_reference"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sys_attachment_reference_business"`);
        await queryRunner.query(`DROP TABLE "sys_attachment_reference"`);
        await queryRunner.query(`DROP INDEX "public"."uq_sys_attachment_object"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sys_attachment_cleanup"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sys_attachment_owner"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sys_attachment_purpose"`);
        await queryRunner.query(`DROP TABLE "sys_attachment"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sys_attachment_audit_attachment"`);
        await queryRunner.query(`DROP TABLE "sys_attachment_audit"`);
    }

}
