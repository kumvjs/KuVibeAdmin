import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPaymentProcessing1790753142319 implements MigrationInterface {
  name = 'AddPaymentProcessing1790753142319'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "biz_payment_attempt" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "store_token" uuid NOT NULL, "binding" jsonb NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'queued', "parameters" jsonb, CONSTRAINT "chk_payment_attempt_status" CHECK ("status" IN ('queued', 'starting', 'ready', 'cancelled')), CONSTRAINT "PK_b9a41eaf1ba86c973fc49c90e54" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_payment_store_token" ON "biz_payment_attempt"  ("store_token") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_payment_attempt_order" ON "biz_payment_attempt"  ("order_id") `)
    await queryRunner.query(`CREATE TABLE "biz_store_identity" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "token" uuid NOT NULL, CONSTRAINT "PK_7303eaf5e2aaba1dbd0fb98575e" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_store_identity_token" ON "biz_store_identity"  ("token") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_store_identity_user" ON "biz_store_identity"  ("tenant_id", "user_id") `)
    await queryRunner.query(`CREATE TABLE "biz_payment_inbox" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint, "channel" character varying(16) NOT NULL, "evidence_hash" character varying(64) NOT NULL, "payload" jsonb NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'pending', "reason" character varying(100), CONSTRAINT "chk_payment_inbox_status" CHECK ("status" IN ('pending', 'done', 'review')), CONSTRAINT "PK_7f1a3d9cd6315a8b4bb701dfb12" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_payment_inbox_order" ON "biz_payment_inbox"  ("order_id", "id") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_payment_inbox_hash" ON "biz_payment_inbox"  ("channel", "evidence_hash") `)
    await queryRunner.query(`CREATE TABLE "biz_payment_transaction" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "channel" character varying(16) NOT NULL, "transaction_key" character varying(255) NOT NULL, "facts" jsonb NOT NULL, "inbox_id" bigint, "bonus_points" bigint NOT NULL, CONSTRAINT "PK_7c575636a36ecdbff11d3bacc25" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_payment_transaction_order" ON "biz_payment_transaction"  ("order_id") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_payment_transaction_key" ON "biz_payment_transaction"  ("channel", "transaction_key") `)
    await queryRunner.query(`ALTER TABLE "biz_payment_attempt" ADD CONSTRAINT "fk_payment_attempt_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_store_identity" ADD CONSTRAINT "fk_store_identity_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_payment_inbox" ADD CONSTRAINT "fk_payment_inbox_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_payment_transaction" ADD CONSTRAINT "fk_payment_transaction_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    for (const table of ['biz_payment_transaction', 'biz_store_identity']) {
      await queryRunner.query(`CREATE TRIGGER protect_${table} BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_billing_version_mutation()`)
      await queryRunner.query(`CREATE TRIGGER protect_${table}_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_version_mutation()`)
    }
    await queryRunner.query(`CREATE FUNCTION protect_payment_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '支付尝试事实不可删除' USING ERRCODE='23514'; END IF;
          IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.order_id,NEW.store_token,NEW.binding) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.order_id,OLD.store_token,OLD.binding)
          OR (OLD.parameters IS NOT NULL AND NEW.parameters IS DISTINCT FROM OLD.parameters)
          OR (NEW.status <> OLD.status AND NOT ((OLD.status='queued' AND NEW.status IN ('starting','cancelled')) OR (OLD.status='starting' AND NEW.status IN ('ready','cancelled')) OR (OLD.status='ready' AND NEW.status='cancelled')))
          THEN RAISE EXCEPTION '支付绑定或状态不可修改或回退' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE TRIGGER protect_payment_attempt BEFORE UPDATE OR DELETE ON biz_payment_attempt FOR EACH ROW EXECUTE FUNCTION protect_payment_attempt()`)
    await queryRunner.query(`CREATE TRIGGER protect_payment_attempt_truncate BEFORE TRUNCATE ON biz_payment_attempt FOR EACH STATEMENT EXECUTE FUNCTION protect_payment_attempt()`)
    await queryRunner.query(`CREATE FUNCTION protect_payment_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '支付通知事实不可删除' USING ERRCODE='23514'; END IF;
          IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.order_id,NEW.channel,NEW.evidence_hash,NEW.payload) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.order_id,OLD.channel,OLD.evidence_hash,OLD.payload)
          OR (OLD.status<>'pending' AND NEW.status<>OLD.status) THEN RAISE EXCEPTION '通知原始事实或终态不可修改' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE TRIGGER protect_payment_inbox BEFORE UPDATE OR DELETE ON biz_payment_inbox FOR EACH ROW EXECUTE FUNCTION protect_payment_inbox()`)
    await queryRunner.query(`CREATE TRIGGER protect_payment_inbox_truncate BEFORE TRUNCATE ON biz_payment_inbox FOR EACH STATEMENT EXECUTE FUNCTION protect_payment_inbox()`)
    await queryRunner.query(`CREATE FUNCTION protect_order_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF (OLD.paid_ledger_id IS NOT NULL AND ROW(NEW.paid_ledger_id,NEW.gift_ledger_id,NEW.settled_at) IS DISTINCT FROM ROW(OLD.paid_ledger_id,OLD.gift_ledger_id,OLD.settled_at))
          OR (OLD.settled_at IS NOT NULL AND NEW.settled_at IS DISTINCT FROM OLD.settled_at)
          THEN RAISE EXCEPTION '订单入账流水和时间不可重置' USING ERRCODE='23514'; END IF;
          IF NEW.status='paid' AND (NEW.paid_ledger_id IS NULL OR NEW.settled_at IS NULL OR NOT EXISTS(SELECT 1 FROM biz_payment_transaction WHERE order_id=NEW.id))
          THEN RAISE EXCEPTION '已支付订单必须关联验真交易和积分入账' USING ERRCODE='23514'; END IF;
          IF NEW.status<>OLD.status AND NOT (
             (OLD.status='pending' AND NEW.status IN ('closing','closed','paid','review')) OR
             (OLD.status='closing' AND NEW.status IN ('closed','paid','review')) OR
             (OLD.status='closed' AND NEW.status='review') OR
             (OLD.status='paid' AND NEW.status IN ('refund_pending','refunded','review')) OR
             (OLD.status='refund_pending' AND NEW.status IN ('paid','refunded','review')) OR
             (OLD.status='review' AND NEW.status IN ('paid','refund_pending','refunded')))
          THEN RAISE EXCEPTION '订单状态禁止回退或非法跳转' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE TRIGGER protect_order_settlement BEFORE UPDATE ON biz_recharge_order FOR EACH ROW EXECUTE FUNCTION protect_order_settlement()`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['biz_payment_attempt', 'biz_store_identity', 'biz_payment_inbox', 'biz_payment_transaction']
    await queryRunner.query(`LOCK TABLE biz_recharge_order, ${tables.map(table => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`)
    const [row] = await queryRunner.query(`SELECT ${tables.map(table => `EXISTS(SELECT 1 FROM "${table}")`).join(' OR ')} OR EXISTS(SELECT 1 FROM biz_recharge_order WHERE paid_ledger_id IS NOT NULL OR settled_at IS NOT NULL) AS occupied`)
    if (row.occupied)
      throw new Error('支付表已有业务数据，拒绝破坏性回滚；使用前向迁移')
    await queryRunner.query('DROP TRIGGER protect_order_settlement ON biz_recharge_order')
    await queryRunner.query('DROP FUNCTION protect_order_settlement()')
    for (const [table, trigger] of [['biz_payment_attempt', 'protect_payment_attempt'], ['biz_payment_inbox', 'protect_payment_inbox'], ['biz_payment_transaction', 'protect_biz_payment_transaction'], ['biz_store_identity', 'protect_biz_store_identity']]) {
      await queryRunner.query(`DROP TRIGGER ${trigger} ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER ${trigger}_truncate ON "${table}"`)
    }
    await queryRunner.query('DROP FUNCTION protect_payment_attempt()')
    await queryRunner.query('DROP FUNCTION protect_payment_inbox()')
    await queryRunner.query(`ALTER TABLE "biz_payment_transaction" DROP CONSTRAINT "fk_payment_transaction_order"`)
    await queryRunner.query(`ALTER TABLE "biz_payment_inbox" DROP CONSTRAINT "fk_payment_inbox_order"`)
    await queryRunner.query(`ALTER TABLE "biz_store_identity" DROP CONSTRAINT "fk_store_identity_user"`)
    await queryRunner.query(`ALTER TABLE "biz_payment_attempt" DROP CONSTRAINT "fk_payment_attempt_order"`)
    await queryRunner.query(`DROP INDEX "public"."uq_payment_transaction_key"`)
    await queryRunner.query(`DROP INDEX "public"."uq_payment_transaction_order"`)
    await queryRunner.query(`DROP TABLE "biz_payment_transaction"`)
    await queryRunner.query(`DROP INDEX "public"."uq_payment_inbox_hash"`)
    await queryRunner.query(`DROP INDEX "public"."idx_payment_inbox_order"`)
    await queryRunner.query(`DROP TABLE "biz_payment_inbox"`)
    await queryRunner.query(`DROP INDEX "public"."uq_store_identity_user"`)
    await queryRunner.query(`DROP INDEX "public"."uq_store_identity_token"`)
    await queryRunner.query(`DROP TABLE "biz_store_identity"`)
    await queryRunner.query(`DROP INDEX "public"."uq_payment_attempt_order"`)
    await queryRunner.query(`DROP INDEX "public"."uq_payment_store_token"`)
    await queryRunner.query(`DROP TABLE "biz_payment_attempt"`)
  }
}
