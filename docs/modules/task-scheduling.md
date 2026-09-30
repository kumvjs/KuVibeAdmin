# 任务调度与 RabbitMQ

后台“系统管理 → 任务调度”提供在线任务配置、启停、手动运行和执行日志。使用 `@nestjs/schedule` 的动态 cron 能力，任务配置与执行记录存储在 PostgreSQL；RabbitMQ 承接账务 outbox 消费。后台页面位于仓库的 Vben playground，接口模型以 Swagger 的“任务调度”分组为准。

## 在线管理

新建或编辑任务时填写名称，选择服务端注册的处理器，配置六段 cron、IANA 时区、启停和说明。六段顺序为“秒 分 时 日 月 周”，例如 `*/5 * * * * *` 每五秒执行，`0 * * * * *` 每分钟执行。日志按设备时区显示，执行时区独立于用户展示偏好。无效表达式、时区及未知处理器会被服务端拒绝。

| 默认处理器 | 默认调度 | 行为 |
| --- | --- | --- |
| `billing.outbox` | 每五秒，UTC | 分批投递到期账务任务到 RabbitMQ，每次最多 100 个 ID |
| `attachments.cleanup` | 每分钟，UTC | 执行既有附件清理，每次最多 100 条，保留引用及行锁保护 |

在线配置只调用服务端已有业务处理器。扩展业务任务需在后端注册并实现处理器，再由后台配置执行周期；不能通过配置执行任意 JavaScript、SQL 或 Shell。

每个部署最多配置 100 个任务。本实例保存后同步配置，其他实例最多十秒同步；启动时恢复有效配置。停用停止自动触发，手动运行仍可执行。运行中的任务不能同时修改或删除，返回冲突提示；同任务以及同处理器均有数据库锁保护。Cron 通过持久化下一执行时间及唯一调度键避免多个实例重复执行同一周期。停机后的错过周期不会逐条重放；下一次触发继续处理数据库积压。

单实例通过 `TASK_EXECUTION_CONCURRENCY` 限制并行处理器数量，默认 2、范围 1–4；容量已满时手动操作返回 409。定时触发按任务去重进入最多 100 个 ID 的等待队列，同处理器按入队顺序执行，不同处理器可并行，避免固定顺序让后续任务长期等待。错过周期合并，实际执行前重新检查当前启停配置，关闭时释放等待队列。RabbitMQ 的消费并发由 prefetch 独立限制。

任务列表提供筛选、分页及配置操作，日志可按状态筛选和查看详情。“全部执行日志”保留已删除任务的名称、处理器及执行快照。权限分别为 `system:task:list/create/update/delete/run/log`，普通用户不授予这些管理权限。部署后运行既有 `setup` 补齐菜单和按钮权限，不覆盖自定义菜单元数据。

## 执行记录

记录包含触发方式、执行状态、起止时间、耗时及安全错误代码。`running` 表示执行中，`success` 表示处理器完成，`failed` 表示失败，`skipped` 表示处理器被其他任务占用。失败保留审计，后续周期可重试；同任务并发手动运行返回 409。中断执行可记录为 `execution_interrupted`，错误日志不保存支付渠道响应、密钥或个人信息。

`billing.outbox` 的成功表示本轮投递处理器完成，实际订单、退款、到账结果由业务状态决定。RabbitMQ 消费继续更新 outbox 的 `pending/processing/done/dead`，业务积压和死信的查询与恢复见[账务运维](billing-operations.md)。

默认保留最近 30 天执行日志，可通过 `TASK_LOG_RETENTION_DAYS` 在 1–365 天范围调整。后台清理每五分钟、每实例最多删除 1000 条已结束记录，并通过索引和 `SKIP LOCKED` 避让；执行中记录保留。每五秒调度每天约产生 17,280 条记录，增加高频任务或保留天数前应评估存储、清理速率与查询容量。这些运行日志不替代永久保留的账务流水和业务审计。

## 账务投递与恢复

业务事务仍在同一 PostgreSQL 事务内写 outbox。到期任务由定时处理器读取并发送 ID，RabbitMQ 不保存资金状态和渠道凭据。发布使用持久消息与 publisher confirms；消费者手动确认，通过 `RABBITMQ_PREFETCH` 限制并发。服务端最大队列长度为 10,000，积压时拒绝新的发布并由数据库保留待投递任务。

消费者取得消息后才申请 120 秒数据库租约，避免排队时间占用租期。进程同时处理数也受 prefetch 上限约束，重连后旧处理尚未完成时，超额消息不领取租约、不消耗重试预算，由 outbox 后续补投。订单到期、支付准备/查询/通知/关单、Google 消费、退款及对账继续复用原有领域处理器。重复消息只能有一方取得有效租约，完成/重试使用租约 token 校验；渠道明确 pending 延迟再处理，普通失败退避并在预算耗尽后进入 dead。处理未知状态时沿用业务规则，不提前显示交易成功。

RabbitMQ 或数据库暂时故障时，数据库任务保留，消息连接通过 cron 定期重连，恢复后重新投递到期任务。消息确认与数据库更新之间的故障可能导致重复投递，因此业务幂等仍是必须的保护。启用 RabbitMQ 后不回退到直接轮询执行；`BILLING_WORKER_ENABLED=false` 可让 API 实例停止账务投递与消费，该实例的投递处理器会直接返回。独立业务数据库必须使用独立队列名称，开发多实例验收使用 `kuvibe.billing.scale`，避免把消息消费到其他数据库。

## Docker 与升级

新环境按[Docker 指南](../guide/docker.md)初始化。RabbitMQ 固定 `4.3.6-management`，使用独立密码、虚拟主机和持久卷；普通配置的管理界面为 `http://localhost:15672`，开发环境为 `http://localhost:15673`，均只绑定回环。开发 AMQP 地址为 `127.0.0.1:5673`，容器应用使用 `rabbitmq:5672`。

已有开发环境先补齐消息配置，保留原凭据：

```sh
node scripts/docker-init.mjs --dev --rabbitmq
node scripts/docker-dev.mjs up -d --wait rabbitmq
node scripts/docker-dev.mjs build backend
```

新表通过 TypeORM 迁移创建，禁止开启 synchronize。先按[团队统一入口](../guide/getting-started.md#团队统一使用方式)和 Atlas Skill 审查/验证迁移，再在维护窗口执行迁移与 setup，启动新应用。生产执行仍由部署流程负责。回退应用时先停用调度和消费，保留 RabbitMQ 卷及 outbox/执行历史；已有执行记录时不要用删表回滚清空日志，应保留新表并回退兼容应用或前向修复。

RabbitMQ 管理界面可观察队列的 ready、unacked 和消费者数量；凭据从对应根环境文件读取，不提供默认密码。管理服务的健康检查只代表消息节点运行，队列积压和消费者健康还需结合应用执行记录与 outbox 诊断。

## 重复验收

开发依赖启动后，在仓库根目录运行容器集成测试，避免宿主机与容器的原生依赖混用：

```sh
node scripts/docker-dev.mjs run --rm --no-deps -e TASK_TEST_DATABASE=kuvibe_task_verify migrate pnpm test:tasks:integration
node scripts/docker-dev.mjs run --rm --no-deps -e TASK_TEST_DATABASE=kuvibe_task_verify migrate pnpm test:rabbitmq:integration
```

后端任务模块维护这两个集成入口。测试创建并清理自己的随机子数据库和 RabbitMQ 队列，不修改日常业务库；HTTP 验证固定使用 Redis DB 14，需保留为测试用途。任务测试覆盖带数据迁移往返、跨实例调度、公平等待、执行日志、实际消息确认/恢复、订单到期以及权限校验，并验证启动监听失败后的资源退出。消息聚焦测试通过阻塞旧连接处理、实际断连重连及 outbox 补投，核对进程并发上限与重试预算。这些命令需要已经构建包含最新依赖和脚本的开发后端镜像，且仅用于开发隔离验收。

实现依据：[NestJS 动态任务调度](https://docs.nestjs.com/techniques/task-scheduling)、[RabbitMQ 发布确认和消费确认](https://www.rabbitmq.com/docs/confirms)、[RabbitMQ 官方镜像](https://hub.docker.com/_/rabbitmq)。
