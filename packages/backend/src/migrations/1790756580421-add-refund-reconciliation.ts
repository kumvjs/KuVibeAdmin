import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRefundReconciliation1790756580421 implements MigrationInterface {
  name = 'AddRefundReconciliation1790756580421'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout='2s'`)
    await queryRunner.query(`CREATE TABLE "biz_recharge_refund" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "request_key" character varying(120) NOT NULL, "request_hash" character varying(64) NOT NULL, "refund_no" character varying(32) NOT NULL, "channel" character varying(16) NOT NULL, "kind" character varying(10) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'held', "amount_minor" bigint, "source_points" bigint NOT NULL, "hold_id" bigint, "recovered_points" bigint NOT NULL DEFAULT '0', "gap_points" bigint NOT NULL DEFAULT '0', "actor_id" bigint, "reason" character varying(500) NOT NULL, "evidence_hash" character varying(64), CONSTRAINT "chk_recharge_refund_status" CHECK ("status" IN ('held', 'processing', 'succeeded', 'failed', 'review') AND "kind" IN ('manual', 'external')), CONSTRAINT "chk_recharge_refund_amounts" CHECK ("source_points" >= 0 AND "recovered_points" >= 0 AND "gap_points" >= 0 AND ("amount_minor" IS NULL OR "amount_minor" > 0)), CONSTRAINT "PK_b40f0fcff91373882d6a5440dff" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_refund_active" ON "biz_recharge_refund"  ("order_id") WHERE "status" IN ('held', 'processing', 'succeeded')`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_refund_no" ON "biz_recharge_refund"  ("refund_no") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_recharge_refund_key" ON "biz_recharge_refund"  ("order_id", "request_key") `)
    await queryRunner.query(`CREATE TABLE "biz_billing_risk" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "order_id" bigint NOT NULL, "type" character varying(50) NOT NULL, "gap_points" bigint NOT NULL DEFAULT '0', "status" character varying(12) NOT NULL DEFAULT 'open', "resolved_by" bigint, "resolution_reason" character varying(500), "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_billing_risk" CHECK ("gap_points" >= 0 AND "status" IN ('open', 'resolved')), CONSTRAINT "PK_1828078a590dcb7df86b7a582e3" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE INDEX "idx_billing_risk_user" ON "biz_billing_risk"  ("user_id", "status") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_billing_risk_order_type" ON "biz_billing_risk"  ("order_id", "type") `)
    await queryRunner.query(`CREATE TABLE "biz_billing_reconciliation" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" bigint NOT NULL, "request_key" character varying(120) NOT NULL, "request_hash" character varying(64) NOT NULL, "actor_id" bigint NOT NULL, "reason" character varying(500) NOT NULL, "verify_channel" boolean NOT NULL DEFAULT true, "status" character varying(12) NOT NULL DEFAULT 'pending', "findings" jsonb, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_billing_reconciliation_status" CHECK ("status" IN ('pending', 'done', 'review')), CONSTRAINT "PK_c81f8fa5f39fd4038e055b1ba4c" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_billing_reconciliation_key" ON "biz_billing_reconciliation"  ("order_id", "request_key") `)
    await queryRunner.query(`ALTER TABLE "biz_recharge_refund" ADD CONSTRAINT "fk_recharge_refund_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_billing_risk" ADD CONSTRAINT "fk_billing_risk_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_billing_risk" ADD CONSTRAINT "fk_billing_risk_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_billing_reconciliation" ADD CONSTRAINT "fk_billing_reconciliation_order" FOREIGN KEY ("order_id") REFERENCES "biz_recharge_order"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`CREATE FUNCTION protect_refund_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '退款审计不可删除' USING ERRCODE='23514'; END IF;
          IF (to_jsonb(NEW)-ARRAY['status','recovered_points','gap_points','evidence_hash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','recovered_points','gap_points','evidence_hash'])
          OR (OLD.status IN ('succeeded','failed','review') AND NEW IS DISTINCT FROM OLD)
          OR (NEW.status<>OLD.status AND NOT ((OLD.status='held' AND NEW.status IN ('processing','succeeded','failed')) OR (OLD.status='processing' AND NEW.status IN ('succeeded','failed'))))
          THEN RAISE EXCEPTION '退款身份、申请和终态不可篡改' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE FUNCTION protect_risk_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '风险审计不可删除' USING ERRCODE='23514'; END IF;
          IF (to_jsonb(NEW)-ARRAY['status','resolved_by','resolution_reason','resolved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolved_by','resolution_reason','resolved_at']) OR (OLD.status='resolved' AND NEW IS DISTINCT FROM OLD)
          OR (NEW.status='resolved' AND (NEW.resolved_by IS NULL OR NEW.resolution_reason IS NULL OR NEW.resolved_at IS NULL))
          THEN RAISE EXCEPTION '风险事实和处置记录不可篡改' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    await queryRunner.query(`CREATE FUNCTION protect_reconciliation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '对账审计不可删除' USING ERRCODE='23514'; END IF;
          IF (to_jsonb(NEW)-ARRAY['status','findings','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','findings','completed_at']) OR (OLD.status<>'pending' AND NEW IS DISTINCT FROM OLD)
          OR (NEW.status<>'pending' AND (NEW.findings IS NULL OR NEW.completed_at IS NULL))
          THEN RAISE EXCEPTION '对账请求和完成记录不可篡改' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    for (const [table, fn] of [['biz_recharge_refund', 'protect_refund_audit'], ['biz_billing_risk', 'protect_risk_audit'], ['biz_billing_reconciliation', 'protect_reconciliation_audit']]) {
      await queryRunner.query(`CREATE TRIGGER ${fn} BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION ${fn}()`)
      await queryRunner.query(`CREATE TRIGGER ${fn}_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION ${fn}()`)
    }
    await queryRunner.query(`CREATE FUNCTION protect_point_source_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '积分来源与冻结凭证不可删除' USING ERRCODE='23514'; END IF;
          IF (to_jsonb(NEW)-ARRAY['available','frozen','sequence','status','updated_at','remaining']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['available','frozen','sequence','status','updated_at','remaining'])
          THEN RAISE EXCEPTION '积分账户、来源或冻结身份不可修改' USING ERRCODE='23514'; END IF;
          RETURN NEW; END; $$`)
    for (const table of ['biz_point_account', 'biz_point_lot', 'biz_point_hold', 'biz_point_hold_item']) {
      await queryRunner.query(`CREATE TRIGGER protect_${table}_source BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION protect_point_source_identity()`)
      await queryRunner.query(`CREATE TRIGGER protect_${table}_source_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION protect_point_source_identity()`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout='2s'`)
    await queryRunner.query(`LOCK TABLE biz_recharge_refund,biz_billing_risk,biz_billing_reconciliation,biz_point_account,biz_point_lot,biz_point_hold,biz_point_hold_item IN ACCESS EXCLUSIVE MODE`)
    const [data] = await queryRunner.query(`SELECT EXISTS(SELECT 1 FROM biz_recharge_refund UNION ALL SELECT 1 FROM biz_billing_risk UNION ALL SELECT 1 FROM biz_billing_reconciliation UNION ALL SELECT 1 FROM biz_point_ledger WHERE business_type='recharge_refund') AS present`)
    if (data.present)
      throw new Error('退款或对账已有业务数据，禁止回滚迁移，请前向修复')
    for (const table of ['biz_point_account', 'biz_point_lot', 'biz_point_hold', 'biz_point_hold_item']) {
      await queryRunner.query(`DROP TRIGGER protect_${table}_source ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER protect_${table}_source_truncate ON "${table}"`)
    }
    await queryRunner.query(`DROP FUNCTION protect_point_source_identity()`)
    await queryRunner.query(`ALTER TABLE "biz_billing_reconciliation" DROP CONSTRAINT "fk_billing_reconciliation_order"`)
    await queryRunner.query(`ALTER TABLE "biz_billing_risk" DROP CONSTRAINT "fk_billing_risk_order"`)
    await queryRunner.query(`ALTER TABLE "biz_billing_risk" DROP CONSTRAINT "fk_billing_risk_user"`)
    await queryRunner.query(`ALTER TABLE "biz_recharge_refund" DROP CONSTRAINT "fk_recharge_refund_order"`)
    await queryRunner.query(`DROP INDEX "public"."uq_billing_reconciliation_key"`)
    await queryRunner.query(`DROP TABLE "biz_billing_reconciliation"`)
    await queryRunner.query(`DROP INDEX "public"."uq_billing_risk_order_type"`)
    await queryRunner.query(`DROP INDEX "public"."idx_billing_risk_user"`)
    await queryRunner.query(`DROP TABLE "biz_billing_risk"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_refund_key"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_refund_no"`)
    await queryRunner.query(`DROP INDEX "public"."uq_recharge_refund_active"`)
    await queryRunner.query(`DROP TABLE "biz_recharge_refund"`)
    for (const fn of ['protect_refund_audit', 'protect_risk_audit', 'protect_reconciliation_audit'])
      await queryRunner.query(`DROP FUNCTION ${fn}()`)
  }
}
