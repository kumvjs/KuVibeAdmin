import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPointsLedger1790748558277 implements MigrationInterface {
  name = 'AddPointsLedger1790748558277'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "biz_point_account" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" bigint NOT NULL, "available" bigint NOT NULL DEFAULT '0', "frozen" bigint NOT NULL DEFAULT '0', "sequence" bigint NOT NULL DEFAULT '0', "status" character varying(16) NOT NULL DEFAULT 'active', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_point_account_status" CHECK ("status" IN ('active', 'blocked')), CONSTRAINT "chk_point_account_balance" CHECK ("available" >= 0 AND "frozen" >= 0 AND "sequence" >= 0), CONSTRAINT "PK_75f9cc7df6da4598498c1df0583" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_account_user" ON "biz_point_account"  ("tenant_id", "user_id") `)
    await queryRunner.query(`CREATE TABLE "biz_point_ledger" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "account_id" bigint NOT NULL, "sequence" bigint NOT NULL, "action" character varying(16) NOT NULL, "amount" bigint NOT NULL, "available_delta" bigint NOT NULL, "frozen_delta" bigint NOT NULL, "available_before" bigint NOT NULL, "available_after" bigint NOT NULL, "frozen_before" bigint NOT NULL, "frozen_after" bigint NOT NULL, "business_type" character varying(50) NOT NULL, "business_key" character varying(150) NOT NULL, "request_hash" character varying(64) NOT NULL, "reason" character varying(500) NOT NULL, "actor_id" bigint, "reference_id" bigint, "hold_id" bigint, "trace_id" character varying(128), CONSTRAINT "chk_point_ledger_math" CHECK ("available_after" = "available_before" + "available_delta" AND "frozen_after" = "frozen_before" + "frozen_delta" AND "available_after" >= 0 AND "frozen_after" >= 0), CONSTRAINT "chk_point_ledger_action" CHECK ("action" IN ('grant', 'debit', 'freeze', 'capture', 'unfreeze', 'reverse')), CONSTRAINT "chk_point_ledger_amount" CHECK ("amount" > 0), CONSTRAINT "PK_aa8b6b7fd3fa3b8ab2b1533b1ff" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_ledger_reverse" ON "biz_point_ledger"  ("reference_id") WHERE "action" = 'reverse'`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_ledger_business" ON "biz_point_ledger"  ("tenant_id", "business_type", "business_key") `)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_ledger_sequence" ON "biz_point_ledger"  ("account_id", "sequence") `)
    await queryRunner.query(`CREATE TABLE "biz_point_lot" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "account_id" bigint NOT NULL, "grant_id" bigint NOT NULL, "kind" character varying(8) NOT NULL, "initial" bigint NOT NULL, "available" bigint NOT NULL, "frozen" bigint NOT NULL DEFAULT '0', CONSTRAINT "chk_point_lot_kind" CHECK ("kind" IN ('paid', 'gift')), CONSTRAINT "chk_point_lot_amount" CHECK ("initial" > 0 AND "available" >= 0 AND "frozen" >= 0 AND "available" + "frozen" <= "initial"), CONSTRAINT "PK_285d67fdcab6fe214e5057ed4ca" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_lot_grant" ON "biz_point_lot"  ("grant_id") `)
    await queryRunner.query(`CREATE INDEX "idx_point_lot_account" ON "biz_point_lot"  ("account_id", "kind", "id") `)
    await queryRunner.query(`CREATE TABLE "biz_point_allocation" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ledger_id" bigint NOT NULL, "lot_id" bigint NOT NULL, "amount" bigint NOT NULL, CONSTRAINT "chk_point_allocation_amount" CHECK ("amount" > 0), CONSTRAINT "PK_4d5ec5835cdb32d9d609c3058fb" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_allocation" ON "biz_point_allocation"  ("ledger_id", "lot_id") `)
    await queryRunner.query(`CREATE TABLE "biz_point_hold" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "account_id" bigint NOT NULL, "ledger_id" bigint NOT NULL, "initial" bigint NOT NULL, "remaining" bigint NOT NULL, CONSTRAINT "chk_point_hold_amount" CHECK ("remaining" >= 0 AND "remaining" <= "initial" AND "initial" > 0), CONSTRAINT "PK_4b65d58d60169ae4c15c98e6182" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_hold_ledger" ON "biz_point_hold"  ("ledger_id") `)
    await queryRunner.query(`CREATE TABLE "biz_point_hold_item" ("id" BIGSERIAL NOT NULL, "tenant_id" bigint NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "hold_id" bigint NOT NULL, "lot_id" bigint NOT NULL, "initial" bigint NOT NULL, "remaining" bigint NOT NULL, CONSTRAINT "chk_point_hold_item_amount" CHECK ("remaining" >= 0 AND "remaining" <= "initial" AND "initial" > 0), CONSTRAINT "PK_e68d0e0fddcb874348acc25bbe5" PRIMARY KEY ("id"))`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_point_hold_item" ON "biz_point_hold_item"  ("hold_id", "lot_id") `)
    await queryRunner.query(`ALTER TABLE "biz_point_account" ADD CONSTRAINT "fk_point_account_user" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_ledger" ADD CONSTRAINT "fk_point_ledger_account" FOREIGN KEY ("account_id") REFERENCES "biz_point_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_ledger" ADD CONSTRAINT "fk_point_ledger_reference" FOREIGN KEY ("reference_id") REFERENCES "biz_point_ledger"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_lot" ADD CONSTRAINT "fk_point_lot_account" FOREIGN KEY ("account_id") REFERENCES "biz_point_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_lot" ADD CONSTRAINT "fk_point_lot_grant" FOREIGN KEY ("grant_id") REFERENCES "biz_point_ledger"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_allocation" ADD CONSTRAINT "fk_point_allocation_ledger" FOREIGN KEY ("ledger_id") REFERENCES "biz_point_ledger"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_allocation" ADD CONSTRAINT "fk_point_allocation_lot" FOREIGN KEY ("lot_id") REFERENCES "biz_point_lot"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold" ADD CONSTRAINT "fk_point_hold_ledger" FOREIGN KEY ("ledger_id") REFERENCES "biz_point_ledger"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold" ADD CONSTRAINT "fk_point_hold_account" FOREIGN KEY ("account_id") REFERENCES "biz_point_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold_item" ADD CONSTRAINT "fk_point_hold_item_hold" FOREIGN KEY ("hold_id") REFERENCES "biz_point_hold"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold_item" ADD CONSTRAINT "fk_point_hold_item_lot" FOREIGN KEY ("lot_id") REFERENCES "biz_point_lot"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`)
    // 业务纠错只能追加冲正，数据库同时保护流水和来源分配事实。
    await queryRunner.query(`CREATE FUNCTION reject_point_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION '积分流水和分配事实不可修改、删除或清空' USING ERRCODE = '23514'; END; $$`)
    for (const table of ['biz_point_ledger', 'biz_point_allocation']) {
      await queryRunner.query(`CREATE TRIGGER immutable_point_fact BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION reject_point_fact_mutation()`)
      await queryRunner.query(`CREATE TRIGGER immutable_point_fact_truncate BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION reject_point_fact_mutation()`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['biz_point_account', 'biz_point_ledger', 'biz_point_lot', 'biz_point_allocation', 'biz_point_hold', 'biz_point_hold_item']
    await queryRunner.query(`LOCK TABLE ${tables.map(table => `"${table}"`).join(', ')} IN ACCESS EXCLUSIVE MODE`)
    for (const table of tables) {
      if ((await queryRunner.query(`SELECT 1 FROM "${table}" LIMIT 1`)).length)
        throw new Error(`拒绝回滚：${table} 已有财务数据，请关闭入口并前向修复。`)
    }
    for (const table of ['biz_point_ledger', 'biz_point_allocation']) {
      await queryRunner.query(`DROP TRIGGER immutable_point_fact ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER immutable_point_fact_truncate ON "${table}"`)
    }
    await queryRunner.query(`DROP FUNCTION reject_point_fact_mutation()`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold_item" DROP CONSTRAINT "fk_point_hold_item_lot"`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold_item" DROP CONSTRAINT "fk_point_hold_item_hold"`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold" DROP CONSTRAINT "fk_point_hold_ledger"`)
    await queryRunner.query(`ALTER TABLE "biz_point_hold" DROP CONSTRAINT "fk_point_hold_account"`)
    await queryRunner.query(`ALTER TABLE "biz_point_allocation" DROP CONSTRAINT "fk_point_allocation_lot"`)
    await queryRunner.query(`ALTER TABLE "biz_point_allocation" DROP CONSTRAINT "fk_point_allocation_ledger"`)
    await queryRunner.query(`ALTER TABLE "biz_point_lot" DROP CONSTRAINT "fk_point_lot_grant"`)
    await queryRunner.query(`ALTER TABLE "biz_point_lot" DROP CONSTRAINT "fk_point_lot_account"`)
    await queryRunner.query(`ALTER TABLE "biz_point_ledger" DROP CONSTRAINT "fk_point_ledger_reference"`)
    await queryRunner.query(`ALTER TABLE "biz_point_ledger" DROP CONSTRAINT "fk_point_ledger_account"`)
    await queryRunner.query(`ALTER TABLE "biz_point_account" DROP CONSTRAINT "fk_point_account_user"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_hold_item"`)
    await queryRunner.query(`DROP TABLE "biz_point_hold_item"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_hold_ledger"`)
    await queryRunner.query(`DROP TABLE "biz_point_hold"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_allocation"`)
    await queryRunner.query(`DROP TABLE "biz_point_allocation"`)
    await queryRunner.query(`DROP INDEX "public"."idx_point_lot_account"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_lot_grant"`)
    await queryRunner.query(`DROP TABLE "biz_point_lot"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_ledger_sequence"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_ledger_business"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_ledger_reverse"`)
    await queryRunner.query(`DROP TABLE "biz_point_ledger"`)
    await queryRunner.query(`DROP INDEX "public"."uq_point_account_user"`)
    await queryRunner.query(`DROP TABLE "biz_point_account"`)
  }
}
