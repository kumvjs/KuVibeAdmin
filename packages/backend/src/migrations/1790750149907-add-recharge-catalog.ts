import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRechargeCatalog1790750149907 implements MigrationInterface {
  name = 'AddRechargeCatalog1790750149907'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "biz_recharge_package" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'draft', "current_revision" integer NOT NULL DEFAULT '1', CONSTRAINT "chk_recharge_package_status" CHECK ("status" IN ('draft', 'enabled', 'disabled')), CONSTRAINT "PK_397effc2c448629be01568f4217" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_package_code" ON "biz_recharge_package"  ("tenant_id", "code") `)
    await queryRunner.query(`CREATE TABLE "biz_package_version" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "package_id" bigint NOT NULL, "revision" integer NOT NULL, "title" character varying(100) NOT NULL, "price_minor" bigint NOT NULL, "base_points" bigint NOT NULL, "gift_points" bigint NOT NULL DEFAULT '0', "starts_at" TIMESTAMP WITH TIME ZONE, "ends_at" TIMESTAMP WITH TIME ZONE, "total_limit" bigint, "daily_limit" bigint, "user_total_limit" bigint, "user_daily_limit" bigint, "actor_id" bigint NOT NULL, CONSTRAINT "chk_package_version_window" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"), CONSTRAINT "chk_package_version_limits" CHECK (("total_limit" IS NULL OR "total_limit" >= 0) AND ("daily_limit" IS NULL OR "daily_limit" >= 0) AND ("user_total_limit" IS NULL OR "user_total_limit" >= 0) AND ("user_daily_limit" IS NULL OR "user_daily_limit" >= 0)), CONSTRAINT "chk_package_version_amount" CHECK ("price_minor" > 0 AND "base_points" > 0 AND "gift_points" >= 0 AND "revision" > 0), CONSTRAINT "PK_aae273b26a4ac8c498576adca03" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_package_version" ON "biz_package_version"  ("package_id", "revision") `)
    await queryRunner.query(`CREATE TABLE "biz_channel_product" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version_id" bigint NOT NULL, "channel" character varying(16) NOT NULL, "application_id" character varying(255) NOT NULL, "environment" character varying(16) NOT NULL, "product_id" character varying(255) NOT NULL, "actor_id" bigint NOT NULL, CONSTRAINT "chk_channel_product_kind" CHECK ("channel" IN ('apple', 'google') AND "environment" IN ('sandbox', 'production')), CONSTRAINT "PK_b8cb7abb336b8a888428c8db385" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_channel_product" ON "biz_channel_product"  ("channel", "application_id", "environment", "product_id") `)
    await queryRunner.query(`CREATE TABLE "biz_promotion" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'draft', "current_revision" integer NOT NULL DEFAULT '1', CONSTRAINT "chk_promotion_status" CHECK ("status" IN ('draft', 'enabled', 'disabled')), CONSTRAINT "PK_ba089c28feb271595d2d6b57765" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_promotion_code" ON "biz_promotion"  ("tenant_id", "code") `)
    await queryRunner.query(`CREATE TABLE "biz_promotion_version" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "promotion_id" bigint NOT NULL, "revision" integer NOT NULL, "title" character varying(100) NOT NULL, "rules" jsonb NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "actor_id" bigint NOT NULL, CONSTRAINT "chk_promotion_window" CHECK ("starts_at" < "ends_at" AND "revision" > 0), CONSTRAINT "PK_665a07ffb3f07d009ccd6fba318" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_promotion_version" ON "biz_promotion_version"  ("promotion_id", "revision") `)
    await queryRunner.query(`CREATE TABLE "biz_coupon" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code_hash" character varying(64) NOT NULL, "promotion_id" bigint NOT NULL, "version_id" bigint NOT NULL, "user_id" bigint, "total_limit" bigint, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "actor_id" bigint NOT NULL, CONSTRAINT "chk_coupon_window" CHECK ("starts_at" < "ends_at" AND ("total_limit" IS NULL OR "total_limit" >= 0)), CONSTRAINT "PK_77380499c0c4c9aeb464ca5eae1" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_coupon_hash" ON "biz_coupon"  ("tenant_id", "code_hash") `)
    await queryRunner.query(`CREATE TABLE "biz_quota_bucket" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resource_key" character varying(255) NOT NULL, "period_key" character varying(32) NOT NULL, "limit" bigint, "reserved" bigint NOT NULL DEFAULT '0', "sold" bigint NOT NULL DEFAULT '0', CONSTRAINT "chk_quota_capacity" CHECK ("reserved" >= 0 AND "sold" >= 0 AND ("limit" IS NULL OR "limit" >= "reserved"::numeric + "sold"::numeric)), CONSTRAINT "PK_5d074a9a7a300b552bd67b71a32" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_quota_resource" ON "biz_quota_bucket"  ("tenant_id", "resource_key", "period_key") `)
    await queryRunner.query(`CREATE TABLE "biz_recharge_user_state" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "first_order_id" bigint, "settlement_sequence" bigint NOT NULL DEFAULT '0', "current_order_id" bigint, CONSTRAINT "chk_recharge_sequence" CHECK ("settlement_sequence" >= 0), CONSTRAINT "PK_99cce551a7e76139e95763bd96a" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_user_state" ON "biz_recharge_user_state"  ("tenant_id", "user_id") `)
    await queryRunner.query(`CREATE TABLE "biz_recharge_user_day" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "business_date" date NOT NULL, "first_order_id" bigint, CONSTRAINT "PK_f7d30859bdb432af36b2d556dde" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_user_day" ON "biz_recharge_user_day"  ("tenant_id", "user_id", "business_date") `)
    await queryRunner.query(`ALTER TABLE "biz_package_version" ADD CONSTRAINT "fk_package_version_package" FOREIGN KEY ("package_id") REFERENCES "biz_recharge_package"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_channel_product" ADD CONSTRAINT "fk_channel_product_version" FOREIGN KEY ("version_id") REFERENCES "biz_package_version"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_promotion_version" ADD CONSTRAINT "fk_promotion_version_promotion" FOREIGN KEY ("promotion_id") REFERENCES "biz_promotion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" ADD CONSTRAINT "fk_coupon_promotion" FOREIGN KEY ("promotion_id") REFERENCES "biz_promotion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" ADD CONSTRAINT "fk_coupon_version" FOREIGN KEY ("version_id") REFERENCES "biz_promotion_version"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" ADD CONSTRAINT "fk_coupon_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_user_state" ADD CONSTRAINT "fk_recharge_state_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_user_day" ADD CONSTRAINT "fk_recharge_day_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`CREATE FUNCTION reject_billing_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '账务版本和发券事实不可修改或删除' USING ERRCODE = '23514'; END; $$`)
    for (const table of ['biz_package_version', 'biz_channel_product', 'biz_promotion_version', 'biz_coupon']) {
      await queryRunner.query(`CREATE TRIGGER protect_billing_version BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_billing_version_mutation()`)
      await queryRunner.query(`CREATE TRIGGER protect_billing_version_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_version_mutation()`)
    }
    await queryRunner.query(`CREATE FUNCTION protect_recharge_first_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN RAISE EXCEPTION '充值首单事实不可删除' USING ERRCODE = '23514'; END IF; IF OLD.first_order_id IS NOT NULL AND NEW.first_order_id IS DISTINCT FROM OLD.first_order_id THEN RAISE EXCEPTION '充值首单事实不可重置' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`)
    for (const table of ['biz_recharge_user_state', 'biz_recharge_user_day']) {
      await queryRunner.query(`CREATE TRIGGER protect_recharge_first BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION protect_recharge_first_fact()`)
      await queryRunner.query(`CREATE TRIGGER protect_recharge_first_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION protect_recharge_first_fact()`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['biz_recharge_package', 'biz_package_version', 'biz_channel_product', 'biz_promotion', 'biz_promotion_version', 'biz_coupon', 'biz_quota_bucket', 'biz_recharge_user_state', 'biz_recharge_user_day']
    await queryRunner.query(`LOCK TABLE ${tables.map(table => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`)
    const [result] = await queryRunner.query(`SELECT ${tables.map(table => `EXISTS(SELECT 1 FROM "${table}")`).join(' OR ')} AS occupied`)
    if (result.occupied)
      throw new Error('套餐、活动或首单表已有业务数据，拒绝破坏性回滚；请使用前向迁移')
    for (const table of ['biz_package_version', 'biz_channel_product', 'biz_promotion_version', 'biz_coupon']) {
      await queryRunner.query(`DROP TRIGGER protect_billing_version ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER protect_billing_version_truncate ON "${table}"`)
    }
    await queryRunner.query('DROP FUNCTION reject_billing_version_mutation()')
    for (const table of ['biz_recharge_user_state', 'biz_recharge_user_day']) {
      await queryRunner.query(`DROP TRIGGER protect_recharge_first ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER protect_recharge_first_truncate ON "${table}"`)
    }
    await queryRunner.query('DROP FUNCTION protect_recharge_first_fact()')
    await queryRunner.query(`ALTER TABLE "biz_recharge_user_day" DROP CONSTRAINT "fk_recharge_day_user"`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_user_state" DROP CONSTRAINT "fk_recharge_state_user"`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" DROP CONSTRAINT "fk_coupon_user"`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" DROP CONSTRAINT "fk_coupon_version"`)
    await queryRunner.query(`ALTER TABLE "biz_coupon" DROP CONSTRAINT "fk_coupon_promotion"`)
    await queryRunner.query(`ALTER TABLE "biz_promotion_version" DROP CONSTRAINT "fk_promotion_version_promotion"`)
    await queryRunner.query(`ALTER TABLE "biz_channel_product" DROP CONSTRAINT "fk_channel_product_version"`)
    await queryRunner.query(`ALTER TABLE "biz_package_version" DROP CONSTRAINT "fk_package_version_package"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_user_day"`)
    await queryRunner.query(`DROP TABLE "biz_recharge_user_day"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_user_state"`)
    await queryRunner.query(`DROP TABLE "biz_recharge_user_state"`)
    await queryRunner.query(`DROP INDEX "public"."uq_quota_resource"`)
    await queryRunner.query(`DROP TABLE "biz_quota_bucket"`)
    await queryRunner.query(`DROP INDEX "public"."uq_coupon_hash"`)
    await queryRunner.query(`DROP TABLE "biz_coupon"`)
    await queryRunner.query(`DROP INDEX "public"."uq_promotion_version"`)
    await queryRunner.query(`DROP TABLE "biz_promotion_version"`)
    await queryRunner.query(`DROP INDEX "public"."uq_promotion_code"`)
    await queryRunner.query(`DROP TABLE "biz_promotion"`)
    await queryRunner.query(`DROP INDEX "public"."uq_channel_product"`)
    await queryRunner.query(`DROP TABLE "biz_channel_product"`)
    await queryRunner.query(`DROP INDEX "public"."uq_package_version"`)
    await queryRunner.query(`DROP TABLE "biz_package_version"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_package_code"`)
    await queryRunner.query(`DROP TABLE "biz_recharge_package"`)
  }
}
