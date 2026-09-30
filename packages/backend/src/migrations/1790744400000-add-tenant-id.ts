import type { MigrationInterface, QueryRunner } from 'typeorm'

const TABLES = [
  'sys_dept',
  'sys_menu',
  'sys_role_menu',
  'sys_role',
  'sys_user_role',
  'sys_user',
  'user_refresh_token',
  'sys_captcha_log',
  'sys_login_log',
  'sys_attachment_audit',
  'sys_attachment',
  'sys_attachment_reference',
  'sys_upload_policy',
] as const

// CommonEntity 已预留 tenantId='1'；补齐迁移，保持现有单租户语义。
// 仍需要排他锁；已有业务库需在维护窗口和明确超时预算下执行。
export class AddTenantId1790744400000 implements MigrationInterface {
  name = 'AddTenantId1790744400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES)
      await queryRunner.query(`ALTER TABLE "${table}" ADD "tenant_id" bigint NOT NULL DEFAULT '1'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 同一事务中先锁定所有表，再检查全部数据，避免检查后并发写入或部分删列。
    await queryRunner.query(`LOCK TABLE ${TABLES.map(table => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`)
    for (const table of TABLES) {
      const rows = await queryRunner.query(`SELECT 1 FROM "${table}" WHERE "tenant_id" <> 1 LIMIT 1`)
      if (rows.length > 0)
        throw new Error(`拒绝回滚：${table} 存在非默认 tenant_id，请保留租户数据并采用前向修复。`)
    }
    for (const table of [...TABLES].reverse())
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id"`)
  }
}
