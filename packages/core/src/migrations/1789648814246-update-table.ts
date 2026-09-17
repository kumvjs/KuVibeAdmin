import type { MigrationInterface, QueryRunner } from 'typeorm'

// 用户确认旧 timestamp 值为 UTC；原地转换保留历史时间、软删除状态及索引。
// ALTER TYPE 仍需排他锁，大表须先演练并安排维护窗口或分阶段迁移。
export class UpdateTable1789648814246 implements MigrationInterface {
  name = 'UpdateTable1789648814246'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sys_dept"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_menu"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_role_menu"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_role"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_user_role"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_user"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "user_refresh_token"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "expired_at" TYPE timestamptz USING "expired_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_captcha_log"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_login_log"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment_audit"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment_reference"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_upload_policy"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamptz USING "deleted_at" AT TIME ZONE 'UTC'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sys_upload_policy"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment_reference"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_attachment_audit"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_login_log"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_captcha_log"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "user_refresh_token"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "expired_at" TYPE timestamp without time zone USING "expired_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_user"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_user_role"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_role"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_role_menu"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_menu"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
    await queryRunner.query(`ALTER TABLE "sys_dept"
      ALTER COLUMN "created_at" TYPE timestamp without time zone USING "created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "updated_at" TYPE timestamp without time zone USING "updated_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "deleted_at" TYPE timestamp without time zone USING "deleted_at" AT TIME ZONE 'UTC'`)
  }
}
