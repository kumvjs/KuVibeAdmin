import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTable1789459958471 implements MigrationInterface {
    name = 'UpdateTable1789459958471'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "sys_dept" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "pid" bigint, "name" character varying(20) NOT NULL, "status" smallint NOT NULL DEFAULT '1', "remark" character varying(50), "order_no" integer NOT NULL DEFAULT '0', CONSTRAINT "chk_sys_dept_status" CHECK ("status" IN (0, 1)), CONSTRAINT "PK_bcff95950c9e1012cf91f2d3134" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_dept_pid" ON "sys_dept"  ("pid") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_dept_status" ON "sys_dept"  ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_dept_order_no" ON "sys_dept"  ("order_no") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_dept_parent_name" ON "sys_dept"  ("pid", "name") WHERE "pid" IS NOT NULL AND "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_dept_root_name" ON "sys_dept"  ("name") WHERE "pid" IS NULL AND "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE TABLE "sys_menu" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "pid" bigint, "name" character varying(30) NOT NULL, "path" character varying(100), "auth_code" character varying(255), "type" character varying(20) NOT NULL DEFAULT 'menu', "component" character varying(255), "redirect" character varying(100), "meta" jsonb NOT NULL DEFAULT '{}'::jsonb, "status" smallint NOT NULL DEFAULT '1', CONSTRAINT "chk_sys_menu_status" CHECK ("status" IN (0, 1)), CONSTRAINT "chk_sys_menu_type" CHECK ("type" IN ('catalog', 'menu', 'embedded', 'link', 'button')), CONSTRAINT "PK_8b22e66a03950819c40639e58f8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_menu_pid" ON "sys_menu"  ("pid") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_menu_name" ON "sys_menu"  ("name") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_menu_path" ON "sys_menu"  ("path") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_menu_auth_code" ON "sys_menu"  ("auth_code") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE INDEX "idx_sys_menu_type" ON "sys_menu"  ("type") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_menu_status" ON "sys_menu"  ("status") `);
        await queryRunner.query(`CREATE TABLE "sys_role_menu" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "role_id" bigint NOT NULL, "menu_id" bigint NOT NULL, CONSTRAINT "uq_sys_role_menu_role_menu" UNIQUE ("role_id", "menu_id"), CONSTRAINT "PK_936363c1820868b370b3f577907" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_role_menu_role_id" ON "sys_role_menu"  ("role_id") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_role_menu_menu_id" ON "sys_role_menu"  ("menu_id") `);
        await queryRunner.query(`CREATE TABLE "sys_role" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "name" character varying(50) NOT NULL, "code" character varying(64) NOT NULL, "remark" character varying(255), "status" smallint NOT NULL DEFAULT '1', "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "chk_sys_role_status" CHECK ("status" IN (0, 1)), CONSTRAINT "PK_12875ba0686cf845f353704dc7b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_role_name" ON "sys_role"  ("name") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_role_code" ON "sys_role"  ("code") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_role_status" ON "sys_role"  ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_role_is_default" ON "sys_role"  ("is_default") `);
        await queryRunner.query(`CREATE TABLE "sys_user_role" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "user_id" bigint NOT NULL, "role_id" bigint NOT NULL, CONSTRAINT "uq_sys_user_role_user_role" UNIQUE ("user_id", "role_id"), CONSTRAINT "PK_a2778b46b9d5922a176b17f1789" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_sys_user_role_user_id" ON "sys_user_role"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_user_role_role_id" ON "sys_user_role"  ("role_id") `);
        await queryRunner.query(`CREATE TABLE "sys_user" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "username" character varying(100) NOT NULL, "name" character varying(100) NOT NULL, "password_hash" character varying(255) NOT NULL, "password_algorithm" character varying(16) NOT NULL DEFAULT 'argon2id', "session_version" integer NOT NULL DEFAULT '1', "avatar" character varying(500), "home_path" character varying(255), "description" character varying(500), "dept_id" bigint, "remark" character varying(255), "timezone" character varying(64), "status" smallint NOT NULL DEFAULT '1', CONSTRAINT "chk_sys_user_session_version" CHECK ("session_version" > 0), CONSTRAINT "chk_sys_user_password_hash" CHECK ("password_hash" LIKE '$argon2id$%'), CONSTRAINT "chk_sys_user_password_algorithm" CHECK ("password_algorithm" = 'argon2id'), CONSTRAINT "chk_sys_user_status" CHECK ("status" IN (0, 1)), CONSTRAINT "PK_b286272b5d723fa76dca97a159e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_user_username" ON "sys_user"  ("username") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE INDEX "idx_sys_user_name" ON "sys_user"  ("name") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_user_dept_id" ON "sys_user"  ("dept_id") `);
        await queryRunner.query(`CREATE INDEX "idx_sys_user_status" ON "sys_user"  ("status") `);
        await queryRunner.query(`CREATE TABLE "user_refresh_token" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "value" character varying(500) NOT NULL, "expired_at" TIMESTAMP NOT NULL, "user_id" bigint NOT NULL, CONSTRAINT "PK_2f86bb87603956e017efa2e74ec" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_refresh_token"."expired_at" IS '令牌过期时间'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_user_refresh_token_value" ON "user_refresh_token"  ("value") `);
        await queryRunner.query(`CREATE INDEX "idx_user_refresh_token_user_id" ON "user_refresh_token"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "sys_captcha_log" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "user_id" integer, "account" character varying, "code" character varying, "provider" character varying(50) NOT NULL DEFAULT 'unknown', CONSTRAINT "PK_f9bbb657efa0008a34349f0b685" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "sys_login_log" ("id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" bigint, "updated_by" bigint, "ip" character varying, "address" character varying, "provider" character varying, "ua" character varying(500), "user_id" bigint, CONSTRAINT "PK_58546a7f24713923b02c0a7e252" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "sys_dept" ADD CONSTRAINT "FK_4f0b0b6eb0132841802c9284e7d" FOREIGN KEY ("pid") REFERENCES "sys_dept"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_menu" ADD CONSTRAINT "FK_5f96ca86bb4964087d55f857e61" FOREIGN KEY ("pid") REFERENCES "sys_menu"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_role_menu" ADD CONSTRAINT "FK_b65fa84413c357d7282153b4a88" FOREIGN KEY ("role_id") REFERENCES "sys_role"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_role_menu" ADD CONSTRAINT "FK_543ffcaa38d767909d9022f2522" FOREIGN KEY ("menu_id") REFERENCES "sys_menu"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_user_role" ADD CONSTRAINT "FK_71b4edf9aedbd3e5707156e80a2" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_user_role" ADD CONSTRAINT "FK_e8300bfcf561ed417f5f02c6776" FOREIGN KEY ("role_id") REFERENCES "sys_role"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_user" ADD CONSTRAINT "FK_96bde34263e2ae3b46f011124ac" FOREIGN KEY ("dept_id") REFERENCES "sys_dept"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_refresh_token" ADD CONSTRAINT "FK_24e64309aedf1c04d857a456dfc" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sys_login_log" ADD CONSTRAINT "FK_3029712e0df6a28edaee46fd470" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sys_login_log" DROP CONSTRAINT "FK_3029712e0df6a28edaee46fd470"`);
        await queryRunner.query(`ALTER TABLE "user_refresh_token" DROP CONSTRAINT "FK_24e64309aedf1c04d857a456dfc"`);
        await queryRunner.query(`ALTER TABLE "sys_user" DROP CONSTRAINT "FK_96bde34263e2ae3b46f011124ac"`);
        await queryRunner.query(`ALTER TABLE "sys_user_role" DROP CONSTRAINT "FK_e8300bfcf561ed417f5f02c6776"`);
        await queryRunner.query(`ALTER TABLE "sys_user_role" DROP CONSTRAINT "FK_71b4edf9aedbd3e5707156e80a2"`);
        await queryRunner.query(`ALTER TABLE "sys_role_menu" DROP CONSTRAINT "FK_543ffcaa38d767909d9022f2522"`);
        await queryRunner.query(`ALTER TABLE "sys_role_menu" DROP CONSTRAINT "FK_b65fa84413c357d7282153b4a88"`);
        await queryRunner.query(`ALTER TABLE "sys_menu" DROP CONSTRAINT "FK_5f96ca86bb4964087d55f857e61"`);
        await queryRunner.query(`ALTER TABLE "sys_dept" DROP CONSTRAINT "FK_4f0b0b6eb0132841802c9284e7d"`);
        await queryRunner.query(`DROP TABLE "sys_login_log"`);
        await queryRunner.query(`DROP TABLE "sys_captcha_log"`);
        await queryRunner.query(`DROP INDEX "idx_user_refresh_token_user_id"`);
        await queryRunner.query(`DROP INDEX "uq_user_refresh_token_value"`);
        await queryRunner.query(`DROP TABLE "user_refresh_token"`);
        await queryRunner.query(`DROP INDEX "idx_sys_user_status"`);
        await queryRunner.query(`DROP INDEX "idx_sys_user_dept_id"`);
        await queryRunner.query(`DROP INDEX "idx_sys_user_name"`);
        await queryRunner.query(`DROP INDEX "uq_sys_user_username"`);
        await queryRunner.query(`DROP TABLE "sys_user"`);
        await queryRunner.query(`DROP INDEX "idx_sys_user_role_role_id"`);
        await queryRunner.query(`DROP INDEX "idx_sys_user_role_user_id"`);
        await queryRunner.query(`DROP TABLE "sys_user_role"`);
        await queryRunner.query(`DROP INDEX "idx_sys_role_is_default"`);
        await queryRunner.query(`DROP INDEX "idx_sys_role_status"`);
        await queryRunner.query(`DROP INDEX "uq_sys_role_code"`);
        await queryRunner.query(`DROP INDEX "uq_sys_role_name"`);
        await queryRunner.query(`DROP TABLE "sys_role"`);
        await queryRunner.query(`DROP INDEX "idx_sys_role_menu_menu_id"`);
        await queryRunner.query(`DROP INDEX "idx_sys_role_menu_role_id"`);
        await queryRunner.query(`DROP TABLE "sys_role_menu"`);
        await queryRunner.query(`DROP INDEX "idx_sys_menu_status"`);
        await queryRunner.query(`DROP INDEX "idx_sys_menu_type"`);
        await queryRunner.query(`DROP INDEX "uq_sys_menu_auth_code"`);
        await queryRunner.query(`DROP INDEX "uq_sys_menu_path"`);
        await queryRunner.query(`DROP INDEX "uq_sys_menu_name"`);
        await queryRunner.query(`DROP INDEX "idx_sys_menu_pid"`);
        await queryRunner.query(`DROP TABLE "sys_menu"`);
        await queryRunner.query(`DROP INDEX "uq_sys_dept_root_name"`);
        await queryRunner.query(`DROP INDEX "uq_sys_dept_parent_name"`);
        await queryRunner.query(`DROP INDEX "idx_sys_dept_order_no"`);
        await queryRunner.query(`DROP INDEX "idx_sys_dept_status"`);
        await queryRunner.query(`DROP INDEX "idx_sys_dept_pid"`);
        await queryRunner.query(`DROP TABLE "sys_dept"`);
    }

}
