import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSystemDict1790771566235 implements MigrationInterface {
  name = 'AddSystemDict1790771566235'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "sys_dict" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "created_by" bigint, "updated_by" bigint, "pid" bigint, "name" character varying(100) NOT NULL, "code" character varying(100) NOT NULL, "value" character varying(1000), "status" smallint NOT NULL DEFAULT '1', "order_no" integer NOT NULL DEFAULT '0', "remark" character varying(500), CONSTRAINT "chk_sys_dict_parent" CHECK ("pid" IS NULL OR "pid" <> "id"), CONSTRAINT "chk_sys_dict_order" CHECK ("order_no" >= 0), CONSTRAINT "chk_sys_dict_status" CHECK ("status" IN (0, 1)), CONSTRAINT "PK_c99797ac6e991ce88c288e0f235" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_sys_dict_pid" ON "sys_dict"  ("pid") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_dict_parent_name" ON "sys_dict"  ("pid", "name") WHERE "pid" IS NOT NULL AND "deleted_at" IS NULL`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_dict_root_name" ON "sys_dict"  ("name") WHERE "pid" IS NULL AND "deleted_at" IS NULL`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_sys_dict_code" ON "sys_dict"  ("code") WHERE "deleted_at" IS NULL`)
    await queryRunner.query(`ALTER TABLE "sys_dict" ADD CONSTRAINT "fk_sys_dict_parent" FOREIGN KEY ("pid") REFERENCES "sys_dict"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 迁移事务中锁定并检查所有行，包括软删除记录；存在数据时保留表并拒绝回滚。
    await queryRunner.query(`LOCK TABLE "sys_dict" IN ACCESS EXCLUSIVE MODE`)
    if ((await queryRunner.query(`SELECT 1 FROM "sys_dict" LIMIT 1`)).length)
      throw new Error('字典已有数据，拒绝回滚删表；请停用入口并采用前向修复。')
    await queryRunner.query(`ALTER TABLE "sys_dict" DROP CONSTRAINT "fk_sys_dict_parent"`)
    await queryRunner.query(`DROP INDEX "public"."uq_sys_dict_code"`)
    await queryRunner.query(`DROP INDEX "public"."uq_sys_dict_root_name"`)
    await queryRunner.query(`DROP INDEX "public"."uq_sys_dict_parent_name"`)
    await queryRunner.query(`DROP INDEX "public"."idx_sys_dict_pid"`)
    await queryRunner.query(`DROP TABLE "sys_dict"`)
  }
}
