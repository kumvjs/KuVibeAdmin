import type { MigrationInterface, QueryRunner } from 'typeorm'

export class DecoupleIapPaymentRecords1790992800000 implements MigrationInterface {
  name = 'DecoupleIapPaymentRecords1790992800000'

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`SET LOCAL lock_timeout = '5s'`)
    await runner.query(`DROP INDEX uq_channel_product`)
    await runner.query(`CREATE UNIQUE INDEX uq_channel_product ON biz_channel_product(version_id, channel, application_id, environment, product_id)`)
    await runner.query(`DROP TRIGGER protect_biz_payment_transaction ON biz_payment_transaction`)
    await runner.query(`ALTER TABLE biz_payment_transaction ALTER COLUMN order_id DROP NOT NULL,
      ADD COLUMN latest_facts jsonb,
      ADD COLUMN status varchar(12) NOT NULL DEFAULT 'unmatched',
      ADD COLUMN reason varchar(100),
      ADD COLUMN verified_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN manual_binding jsonb`)
    // 根据原订单入账证据恢复历史状态，不重写首次验真事实或交易身份。
    await runner.query(`UPDATE biz_payment_transaction t SET latest_facts=t.facts,
      status=CASE WHEN o.paid_ledger_id IS NOT NULL THEN 'fulfilled' ELSE 'review' END
      FROM biz_recharge_order o WHERE o.id=t.order_id`)
    await runner.query(`ALTER TABLE biz_payment_transaction ADD CONSTRAINT chk_payment_transaction_status
      CHECK (status IN ('unmatched','matched','fulfilled','review') AND (status NOT IN ('matched','fulfilled') OR order_id IS NOT NULL))`)
    await runner.query(`CREATE INDEX idx_payment_transaction_status ON biz_payment_transaction(status,id)`)
    await runner.query(`CREATE FUNCTION protect_payment_transaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '平台支付流水不可删除' USING ERRCODE='23514'; END IF;
      IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.channel,NEW.transaction_key,NEW.facts,NEW.inbox_id)
        IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.channel,OLD.transaction_key,OLD.facts,OLD.inbox_id)
        OR (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
        OR (OLD.status='fulfilled' AND ROW(NEW.status,NEW.bonus_points) IS DISTINCT FROM ROW(OLD.status,OLD.bonus_points))
        OR (OLD.manual_binding IS NOT NULL AND NEW.manual_binding IS DISTINCT FROM OLD.manual_binding)
        OR (NEW.latest_facts->>'transactionKey' IS DISTINCT FROM OLD.facts->>'transactionKey')
        OR (NEW.latest_facts->>'channel' IS DISTINCT FROM OLD.facts->>'channel')
        OR (NEW.latest_facts->>'applicationId' IS DISTINCT FROM OLD.facts->>'applicationId')
        OR (NEW.latest_facts->>'environment' IS DISTINCT FROM OLD.facts->>'environment')
      THEN RAISE EXCEPTION '首次支付事实、交易身份、既有关联和履约事实不可修改' USING ERRCODE='23514'; END IF;
      RETURN NEW; END; $$`)
    await runner.query(`CREATE TRIGGER protect_biz_payment_transaction BEFORE UPDATE OR DELETE ON biz_payment_transaction FOR EACH ROW EXECUTE FUNCTION protect_payment_transaction()`)
    // 原truncate触发器继续拒绝删除；通知事实不变，只允许核查记录恢复为已处理。
    await runner.query(`CREATE OR REPLACE FUNCTION protect_payment_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '支付通知事实不可删除' USING ERRCODE='23514'; END IF;
      IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.order_id,NEW.channel,NEW.evidence_hash,NEW.payload)
        IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.order_id,OLD.channel,OLD.evidence_hash,OLD.payload)
        OR (OLD.status='done' AND NEW.status<>OLD.status)
        OR (OLD.status='review' AND NEW.status NOT IN ('review','done'))
      THEN RAISE EXCEPTION '通知原始事实或终态不可修改' USING ERRCODE='23514'; END IF;
      RETURN NEW; END; $$`)
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`SET LOCAL lock_timeout = '5s'`)
    await runner.query(`LOCK TABLE biz_payment_transaction, biz_channel_product, biz_payment_inbox IN ACCESS EXCLUSIVE MODE`)
    const [row] = await runner.query(`SELECT
      EXISTS(SELECT 1 FROM biz_payment_transaction WHERE order_id IS NULL OR manual_binding IS NOT NULL OR latest_facts IS DISTINCT FROM facts OR status IN ('unmatched','matched'))
      OR EXISTS(SELECT 1 FROM biz_channel_product GROUP BY channel,application_id,environment,product_id HAVING count(*)>1) AS occupied`)
    if (row.occupied)
      throw new Error('独立流水、状态变更或共享SKU已使用，拒绝丢失事实的回退；保留结构并前向修复')
    await runner.query(`DROP TRIGGER protect_biz_payment_transaction ON biz_payment_transaction`)
    await runner.query(`DROP FUNCTION protect_payment_transaction()`)
    await runner.query(`DROP INDEX idx_payment_transaction_status`)
    await runner.query(`ALTER TABLE biz_payment_transaction DROP CONSTRAINT chk_payment_transaction_status,
      DROP COLUMN latest_facts, DROP COLUMN status, DROP COLUMN reason, DROP COLUMN verified_at, DROP COLUMN manual_binding,
      ALTER COLUMN order_id SET NOT NULL`)
    await runner.query(`CREATE TRIGGER protect_biz_payment_transaction BEFORE UPDATE OR DELETE ON biz_payment_transaction FOR EACH ROW EXECUTE FUNCTION reject_billing_version_mutation()`)
    await runner.query(`DROP INDEX uq_channel_product`)
    await runner.query(`CREATE UNIQUE INDEX uq_channel_product ON biz_channel_product(channel,application_id,environment,product_id)`)
    await runner.query(`CREATE OR REPLACE FUNCTION protect_payment_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '支付通知事实不可删除' USING ERRCODE='23514'; END IF;
      IF ROW(NEW.id,NEW.tenant_id,NEW.created_at,NEW.order_id,NEW.channel,NEW.evidence_hash,NEW.payload)
        IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.created_at,OLD.order_id,OLD.channel,OLD.evidence_hash,OLD.payload)
        OR (OLD.status<>'pending' AND NEW.status<>OLD.status)
      THEN RAISE EXCEPTION '通知原始事实或终态不可修改' USING ERRCODE='23514'; END IF;
      RETURN NEW; END; $$`)
  }
}
