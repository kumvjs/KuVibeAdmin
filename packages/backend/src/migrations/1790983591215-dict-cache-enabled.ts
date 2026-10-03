import { MigrationInterface, QueryRunner } from 'typeorm'

export class DictCacheEnabled1790983591215 implements MigrationInterface {
  name = 'DictCacheEnabled1790983591215'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sys_dict" ADD "cache_enabled" boolean NOT NULL DEFAULT false`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "sys_dict" IN ACCESS EXCLUSIVE MODE`)
    const rows = await queryRunner.query(`SELECT 1 FROM "sys_dict" WHERE "cache_enabled" = true LIMIT 1`)
    if (rows.length)
      throw new Error('字典已有启用的缓存配置，拒绝丢弃；请先明确恢复方案')
    await queryRunner.query(`ALTER TABLE "sys_dict" DROP COLUMN "cache_enabled"`)
  }
}
