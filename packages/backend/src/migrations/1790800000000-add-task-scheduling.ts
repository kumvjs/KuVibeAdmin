import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTaskScheduling1790800000000 implements MigrationInterface {
  name = 'AddTaskScheduling1790800000000'
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout='2s'`)
    await queryRunner.query('CREATE TABLE "sys_scheduled_task" ("id" BIGSERIAL NOT NULL, "name" character varying(100) NOT NULL, "handler_key" character varying(100) NOT NULL, "cron_expression" character varying(100) NOT NULL, "time_zone" character varying(100) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "description" character varying(500), "next_run_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_scheduled_task_id" CHECK (id < 2147483647), CONSTRAINT "PK_5c94e835f1803405619957ed292" PRIMARY KEY ("id"))')
    await queryRunner.query('CREATE TABLE "sys_task_execution" ("id" BIGSERIAL NOT NULL, "task_id" bigint NOT NULL, "task_name" character varying(100) NOT NULL, "handler_key" character varying(100) NOT NULL, "trigger" character varying(10) NOT NULL, "status" character varying(10) NOT NULL, "dispatch_key" character varying(100) NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, "error_code" character varying(100), CONSTRAINT "chk_task_execution_status" CHECK (status IN (\'running\',\'success\',\'failed\',\'skipped\')), CONSTRAINT "PK_ccc37448140e14db7eb1d74e235" PRIMARY KEY ("id"))')
    await queryRunner.query('CREATE UNIQUE INDEX "uq_task_execution_dispatch" ON "sys_task_execution"  ("dispatch_key") ')
    await queryRunner.query('CREATE INDEX "idx_task_execution_retention" ON "sys_task_execution"  ("started_at") ')
    await queryRunner.query('CREATE INDEX "idx_task_execution_page" ON "sys_task_execution"  ("task_id", "id") ')
    await queryRunner.query('CREATE UNIQUE INDEX "uq_scheduled_task_name" ON "sys_scheduled_task" ("name")')
    await queryRunner.query('CREATE INDEX "idx_task_execution_running" ON "sys_task_execution" ("task_id","started_at") WHERE status=\'running\'')
    await queryRunner.query(`INSERT INTO sys_scheduled_task(name,handler_key,cron_expression,time_zone,enabled,description,next_run_at) VALUES ('账务任务投递','billing.outbox','*/5 * * * * *','UTC',true,'通过 RabbitMQ 投递账务 outbox',now()),('附件清理','attachments.cleanup','0 * * * * *','UTC',true,'分批清理过期和待删除附件',now())`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout='2s'`)
    await queryRunner.query('LOCK TABLE sys_scheduled_task,sys_task_execution IN ACCESS EXCLUSIVE MODE')
    const [usage] = await queryRunner.query('SELECT COUNT(*)::int AS count FROM sys_scheduled_task')
    if (usage.count !== 2)
      throw new Error('默认任务已变更，必须备份并采用前向恢复')
    const [state] = await queryRunner.query(`SELECT (SELECT COUNT(*) FROM sys_task_execution)::int AS logs,(SELECT COUNT(*) FROM sys_scheduled_task WHERE NOT ((handler_key='billing.outbox' AND cron_expression='*/5 * * * * *' AND name='账务任务投递' AND description='通过 RabbitMQ 投递账务 outbox') OR (handler_key='attachments.cleanup' AND cron_expression='0 * * * * *' AND name='附件清理' AND description='分批清理过期和待删除附件')) OR time_zone<>'UTC' OR enabled<>true OR description IS NULL)::int AS custom`)
    if (state.logs || state.custom)
      throw new Error('任务配置或执行日志已使用，必须备份并采用前向恢复，禁止丢弃审计')
    await queryRunner.query('DROP TABLE "sys_scheduled_task"')
    await queryRunner.query('DROP TABLE "sys_task_execution"')
  }
}
