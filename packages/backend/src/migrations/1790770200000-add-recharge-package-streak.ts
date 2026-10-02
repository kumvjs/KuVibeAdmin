import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRechargePackageStreak1790770200000 implements MigrationInterface {
  name = 'AddRechargePackageStreak1790770200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 仅新增投影；旧用户首次读取时从不可变成功订单回放，不批量改写历史。
    await queryRunner.query(`CREATE TABLE "biz_recharge_package_streak" (
      "id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1',
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "user_id" bigint NOT NULL, "package_id" bigint NOT NULL,
      "last_business_date" date NOT NULL, "consecutive_days" integer NOT NULL,
      CONSTRAINT "PK_c325640183c9646c279184c3fa1" PRIMARY KEY ("id"),
      CONSTRAINT "chk_recharge_streak_days" CHECK ("consecutive_days" > 0),
      CONSTRAINT "fk_recharge_streak_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
      CONSTRAINT "fk_recharge_streak_package" FOREIGN KEY ("package_id") REFERENCES "biz_recharge_package"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    )`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_package_streak" ON "biz_recharge_package_streak" ("tenant_id", "user_id", "package_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "biz_recharge_package_streak" IN ACCESS EXCLUSIVE MODE`)
    const [result] = await queryRunner.query(`SELECT EXISTS(SELECT 1 FROM "biz_recharge_package_streak") AS occupied`)
    if (result.occupied)
      throw new Error('连续充值状态已有业务数据，拒绝破坏性回滚；请保留状态并使用前向修复')
    await queryRunner.query(`DROP TABLE "biz_recharge_package_streak"`)
  }
}
