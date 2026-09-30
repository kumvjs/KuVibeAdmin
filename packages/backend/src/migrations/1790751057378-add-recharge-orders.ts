import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRechargeOrders1790751057378 implements MigrationInterface {
  name = 'AddRechargeOrders1790751057378'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "biz_billing_outbox" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying(50) NOT NULL, "business_key" character varying(120) NOT NULL, "aggregate_id" bigint NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "status" character varying(16) NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lease_token" uuid, "leased_until" TIMESTAMP WITH TIME ZONE, "last_error" character varying(100), CONSTRAINT "chk_billing_outbox_status" CHECK ("status" IN ('pending', 'processing', 'done', 'dead') AND "attempts" >= 0), CONSTRAINT "PK_8690fb2fca394abee22fc6f906f" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_billing_outbox_due" ON "biz_billing_outbox"  ("status", "available_at") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_billing_outbox_key" ON "biz_billing_outbox"  ("tenant_id", "type", "business_key") `)
    await queryRunner.query(`CREATE TABLE "biz_recharge_order" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "package_id" bigint NOT NULL, "merchant_no" character varying(32) NOT NULL, "idempotency_key" character varying(120) NOT NULL, "request_hash" character varying(64) NOT NULL, "channel" character varying(16) NOT NULL, "client" character varying(8) NOT NULL, "business_date" date NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "payable_minor" bigint, "snapshot" jsonb NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "payment_initiated" boolean NOT NULL DEFAULT false, "settled_at" TIMESTAMP WITH TIME ZONE, "closed_at" TIMESTAMP WITH TIME ZONE, "paid_ledger_id" bigint, "gift_ledger_id" bigint, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_order_amount" CHECK ("payable_minor" IS NULL OR "payable_minor" > 0), CONSTRAINT "chk_order_channel" CHECK ("channel" IN ('wechat', 'alipay', 'apple', 'google') AND "client" IN ('app', 'qr')), CONSTRAINT "chk_order_status" CHECK ("status" IN ('pending', 'closing', 'closed', 'paid', 'refund_pending', 'refunded', 'review')), CONSTRAINT "PK_99ed257975bfd984a7f99f8b31c" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_recharge_order_expiry" ON "biz_recharge_order"  ("status", "expires_at") `)
    await queryRunner.query(`CREATE INDEX "idx_recharge_order_user" ON "biz_recharge_order"  ("tenant_id", "user_id", "id") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_merchant_no" ON "biz_recharge_order"  ("merchant_no") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_order_key" ON "biz_recharge_order"  ("tenant_id", "user_id", "idempotency_key") `)
    await queryRunner.query(`CREATE TABLE "biz_order_reservation" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "bucket_id" bigint NOT NULL, "amount" bigint NOT NULL, "purpose" character varying(16) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'held', CONSTRAINT "chk_order_reservation" CHECK ("amount" > 0 AND "status" IN ('held', 'consumed', 'released') AND "purpose" IN ('package', 'cash', 'bonus', 'settlement')), CONSTRAINT "PK_1df31e01c47b78cee13fc95406c" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_order_reservation" ON "biz_order_reservation"  ("order_id", "bucket_id") `)
    await queryRunner.query(`CREATE TABLE "biz_order_event" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "type" character varying(50) NOT NULL, "actor_id" bigint, "reason" character varying(500) NOT NULL, CONSTRAINT "PK_854200027f9d4cf216fe9a39266" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_order_event_order" ON "biz_order_event"  ("order_id", "id") `)
    await queryRunner.query(`ALTER TABLE "biz_recharge_order" ADD CONSTRAINT "fk_recharge_order_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_order" ADD CONSTRAINT "fk_recharge_order_package" FOREIGN KEY ("package_id") REFERENCES "biz_recharge_package"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_order_reservation" ADD CONSTRAINT "fk_order_reservation_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_order_reservation" ADD CONSTRAINT "fk_order_reservation_bucket" FOREIGN KEY ("bucket_id") REFERENCES "biz_quota_bucket"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_order_event" ADD CONSTRAINT "fk_order_event_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_billing_outbox" ADD CONSTRAINT "chk_billing_outbox_lease" CHECK (("status" = 'processing' AND "lease_token" IS NOT NULL AND "leased_until" IS NOT NULL) OR ("status" <> 'processing' AND "lease_token" IS NULL AND "leased_until" IS NULL))`)
    await queryRunner.query(`CREATE FUNCTION protect_recharge_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN RAISE EXCEPTION '订单事实不可删除' USING ERRCODE = '23514'; END IF;
          IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.user_id,NEW.package_id,NEW.merchant_no,NEW.idempotency_key,NEW.request_hash,NEW.channel,NEW.client,NEW.business_date,NEW.payable_minor,NEW.snapshot,NEW.expires_at)
             IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.user_id,OLD.package_id,OLD.merchant_no,OLD.idempotency_key,OLD.request_hash,OLD.channel,OLD.client,OLD.business_date,OLD.payable_minor,OLD.snapshot,OLD.expires_at)
          THEN RAISE EXCEPTION '订单快照不可修改' USING ERRCODE = '23514'; END IF;
          IF OLD.payment_initiated AND NOT NEW.payment_initiated THEN RAISE EXCEPTION '支付请求事实不可重置' USING ERRCODE = '23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE TRIGGER protect_recharge_order BEFORE UPDATE OR DELETE ON "biz_recharge_order" FOR EACH ROW EXECUTE FUNCTION protect_recharge_order()`)
    await queryRunner.query(`CREATE TRIGGER protect_recharge_order_truncate BEFORE TRUNCATE ON "biz_recharge_order" FOR EACH STATEMENT EXECUTE FUNCTION protect_recharge_order()`)
    await queryRunner.query(`CREATE FUNCTION protect_order_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN RAISE EXCEPTION '订单预占事实不可删除' USING ERRCODE = '23514'; END IF;
          IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.order_id,NEW.bucket_id,NEW.amount,NEW.purpose) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.order_id,OLD.bucket_id,OLD.amount,OLD.purpose)
          OR (OLD.status <> 'held' AND NEW.status <> OLD.status) THEN RAISE EXCEPTION '预占事实不可修改或重复释放' USING ERRCODE = '23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE TRIGGER protect_order_reservation BEFORE UPDATE OR DELETE ON "biz_order_reservation" FOR EACH ROW EXECUTE FUNCTION protect_order_reservation()`)
    await queryRunner.query(`CREATE TRIGGER protect_order_reservation_truncate BEFORE TRUNCATE ON "biz_order_reservation" FOR EACH STATEMENT EXECUTE FUNCTION protect_order_reservation()`)
    await queryRunner.query(`CREATE TRIGGER protect_order_event BEFORE UPDATE OR DELETE ON "biz_order_event" FOR EACH ROW EXECUTE FUNCTION reject_billing_version_mutation()`)
    await queryRunner.query(`CREATE TRIGGER protect_order_event_truncate BEFORE TRUNCATE ON "biz_order_event" FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_version_mutation()`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['biz_recharge_order', 'biz_order_reservation', 'biz_order_event', 'biz_billing_outbox']
    await queryRunner.query(`LOCK TABLE ${tables.map(table => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`)
    const [result] = await queryRunner.query(`SELECT ${tables.map(table => `EXISTS(SELECT 1 FROM "${table}")`).join(' OR ')} AS occupied`)
    if (result.occupied)
      throw new Error('订单或任务表已有业务数据，拒绝破坏性回滚；请使用前向迁移')
    for (const table of ['biz_recharge_order', 'biz_order_reservation', 'biz_order_event']) {
      const trigger = table === 'biz_recharge_order' ? 'protect_recharge_order' : table === 'biz_order_reservation' ? 'protect_order_reservation' : 'protect_order_event'
      await queryRunner.query(`DROP TRIGGER ${trigger} ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER ${trigger}_truncate ON "${table}"`)
    }
    await queryRunner.query('DROP FUNCTION protect_recharge_order()')
    await queryRunner.query('DROP FUNCTION protect_order_reservation()')
    await queryRunner.query(`ALTER TABLE "biz_order_event" DROP CONSTRAINT "fk_order_event_order"`)
    await queryRunner.query(`ALTER TABLE "biz_order_reservation" DROP CONSTRAINT "fk_order_reservation_bucket"`)
    await queryRunner.query(`ALTER TABLE "biz_order_reservation" DROP CONSTRAINT "fk_order_reservation_order"`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_order" DROP CONSTRAINT "fk_recharge_order_package"`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_order" DROP CONSTRAINT "fk_recharge_order_user"`)
    await queryRunner.query(`DROP INDEX "public"."idx_order_event_order"`)
    await queryRunner.query(`DROP TABLE "biz_order_event"`)
    await queryRunner.query(`DROP INDEX "public"."uq_order_reservation"`)
    await queryRunner.query(`DROP TABLE "biz_order_reservation"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_order_key"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_merchant_no"`)
    await queryRunner.query(`DROP INDEX "public"."idx_recharge_order_user"`)
    await queryRunner.query(`DROP INDEX "public"."idx_recharge_order_expiry"`)
    await queryRunner.query(`DROP TABLE "biz_recharge_order"`)
    await queryRunner.query(`DROP INDEX "public"."uq_billing_outbox_key"`)
    await queryRunner.query(`DROP INDEX "public"."idx_billing_outbox_due"`)
    await queryRunner.query(`DROP TABLE "biz_billing_outbox"`)
  }
}
