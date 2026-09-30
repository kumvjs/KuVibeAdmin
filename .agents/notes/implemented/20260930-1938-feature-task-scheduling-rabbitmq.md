# 任务调度后台与 RabbitMQ 订单消费

记录时间：2026-09-30T19:38:13+08:00。变更集：task-scheduling-rabbitmq-20260930。状态：本次范围实现、验收、审查、文档、版本同步与本地运行完成。

## 问题、上下文与需求

用户明确指定高级全栈角色，要求使用 @nestjs/schedule 开发在线定时任务管理和执行日志，Docker部署RabbitMQ，把既有订单worker接入并停止setInterval。完整度assumable、复杂度Level2；只允许注册处理器，不引入任意代码/SQL/Shell执行。沿用现有账务资金契约、数据库outbox与开发环境；生产执行由部署方负责。

开始时工作区干净，KuVibe0.3.3/schema2为维护状态，已读取项目/栈/相关工作流和进行中账务产物。采用senior-fullstack角色：后端子agent负责backend；前端子agent负责playground新业务API/页面/应用测试；主agent负责Docker、文档、验收协调、版本和笔记。各执行者保留其他人的改动。期间另一执行者完成main合并，既有上游和账务变更保留。

## 决策、替代方案与约束

业务事务继续写数据库outbox，消息只发送ID，避免跨数据库/消息节点网络事务产生双写不一致。Redis锁不能替代原资金幂等和租约；不采用事务内直接发布或消息不可用时回退直接轮询。confirm/ack不能保证恰好一次，仍依靠领域幂等和租约token。

动态配置与执行快照持久化；同任务数据库锁、同处理器锁及唯一调度键分别防止跨实例/跨任务/同周期重复。只存安全错误代码，账务投递成功不等于订单到账。运行日志默认30天，不替代永久资金流水。

前端使用Vben现有Page、Antdv Next、权限和动态菜单扩展，未重设计登录或布局。唯一上游例外为frontend/pnpm-lock.yaml中semver@7.7.4缺失snapshot：冻结镜像构建报错证明业务扩展无法补锁元数据，仅新增两行空snapshot，版本/依赖图不变，升级合并影响限于该记录。根工作区明确docs/backend，Vben自身workspace/catalog/锁独立；固定pnpm11 virtualStoreType: project避免本地/CI布局自动切换，并补齐根锁中既有支付及新增消息依赖。

## 实现与运行边界

- tasks模块提供六段cron、IANA时区、处理器选择、增改删/启停/手动运行、分页筛选和全局/单任务日志；任务删除保留名称/处理器快照。公开契约见Swagger“任务调度”，六项system:task权限及SystemTasks菜单由setup补齐并保护用户自定义元数据。
- 默认billing.outbox每5秒、attachments.cleanup每分钟；@nestjs/schedule动态恢复，配置每10秒同步。最多100任务，默认2并发可1–4；定时等待最多100个去重ID，同处理器FIFO、不同处理器并行，排队后停用与关闭安全收束；手动容量满返回409，停机错过周期合并不逐条重放。
- 1790800000000迁移只新增sys_scheduled_task、sys_task_execution、索引及两默认任务，不改账务旧表。down先锁表再判断配置/日志使用，保护并发审计；使用后采用保留表的兼容回退或前向恢复。日志每5分钟最多清1000结束行，默认30天可1–365；中断running有界恢复，查询/清理有索引。
- RabbitMQ持久队列/ID消息、确认发布、手动确认、prefetch默认5可1–20、队列最大10000拒绝溢出；10秒确认超时，cron重连退避上限60秒。旧连接handler尚未结束时也执行进程级prefetch上限，超额不claim、不消耗预算，outbox后续补投。
- 消费时申请120秒原数据库租约，复用订单到期、支付准备/查询/通知/关单、Google消费、退款和对账处理器。原资金幂等、token、pending延期、有限失败/dead均保留。账务worker和附件清理setInterval移除，tick仅保留为聚焦领域测试入口。
- Compose固定RabbitMQ4.3.6-management，稳定hostname、随机独立密码/vhost/持久卷及健康检查。新环境五个随机密钥；--rabbitmq增量补配置保留已有非空凭据；幂等环境哈希验证通过。开发管理15673、AMQP5673、前端5999、后端17001均限回环；scale独立业务库使用独立队列。
- main启动失败有界close/exit；watch入口--no-shell避免slim镜像缺ps时Shell孙进程孤儿。最终开发镜像实际package版本1.4.0，健康、一个主进程与一个账务消费者。开发迁移及菜单增量setup已执行，原管理员/密钥/业务数据卷保留。

## 验收与审查证据

| 验收 | 实测结果 |
| --- | --- |
| 根pnpm test:tasks:integration | 完整9组exit0，真实host main/HTTP、DTO/RBAC/CRUD/ID溢出/菜单权限；根依赖双Nest实例已修复 |
| 迁移数据与回退 | 旧user/outbox带数据up/down/up保留，实体SQL差异0；并发writer使down报55P03而保持数据/结构，已有日志/custom配置拒绝down |
| 调度与审计 | 两实例同周期去重、同处理器锁、重启恢复、日志安全代码/中断恢复/清理/删除保留；四任务/两处理器/两并发公平排队、重复合并、排队停用与关闭收束 |
| 实际消息/领域 | confirm/ack、重复消息单领取、队列取消重连、过期租约/pending预算；实际OrdersService到期关闭、额度释放及投影清除，不调用真实渠道 |
| 跨重连背压聚焦 | test:rabbitmq:integration exit0：两旧handler阻塞时重连，active≤2、额外消息pending/attempt0；释放后四条done且各claim一次 |
| 代表数据查询 | 50k日志EXPLAIN ANALYZE使用idx_task_execution_page，开发观察约0.05–0.06ms，不外推生产容量 |
| 后端检查 | Linux Jest47套298项通过；最后源码typecheck、构建、改动TS/mjs ESLint及diff检查通过 |
| 前端检查 | 6文件17项Vitest、全typecheck、改动文件lint、production build及独立冻结镜像构建通过 |
| 实际浏览器 | 管理员表单登录/验证码、动态菜单、新建/编辑/启停/确认手动运行/成功日志详情、删除后全局历史、普通用户403、无pageerror；现有主题按钮深浅主题截图检查；固定任务/日志标识列 |
| 热重载与Docker恢复 | 源码临时注释引起PID243→410，恢复原文件后531；一个消费者。临时标记已按SHA256核对字节恢复。RabbitMQ实际容器重启后专用持久消息保留、主队列自动恢复1消费者、默认投递成功 |
| 最终部署/文档 | 最终1.4.0开发镜像冻结构建、健康启动；VitePress根命令构建通过；任务/消息临时测试容器、随机数据库和空队列已清理 |

Atlas项目Skill及两参考文件已读，SQL/隔离库/旧数据/锁/运维影响审查完成；本机没有Atlas CLI，未执行CLI/Pro lint，不将替代验证记录为Atlas lint。浏览器Skill已读取，可调用环境没有其交互runtime工具，因此使用既有Playwright与安装Chrome新上下文完成实际验收，不读取个人浏览器资料。

## 文档、后果与后续

当前产品说明保存在docs/modules/task-scheduling.md，包含操作、处理器扩展、日志/消息语义、配置上限、部署/恢复与两个重复验收入口；Docker/配置/账务运维/README/sidebar同步。任务测试工具归属backend任务模块，根test:tasks:integration与test:rabbitmq:integration及容器方式均有说明；HTTP测试Redis DB14保留专用用途。更新项目/栈当前知识。

旧points-recharge-orders目录保留，增加独立接入与版本归属记录；真实微信/支付宝/Apple/Google配置联调、生产容量/备份恢复及部署仍pending。本地调度/消息验收不替代这些门槛。生产升级需审查备份与迁移→消息健康→应用顺序，高频任务需评估日志产生/清理速率。没有执行生产迁移、提交/tag或发布。

## 版本与完成检查

原始基线为根package.json和packages/backend/package.json的1.3.0；按整个独立新增兼容能力一次minor，目标/实际均1.4.0，结果bumped：两处1.3.0→1.4.0。决定先记录在原active plan，重试复用原基线/目标，没有重复递增。清单、根/backend冻结锁与安装元数据、CHANGELOG、当前上下文及实际开发镜像已同步；锁文件不携带本包版本，无内部版本引用待更新。docs无版本；Vben上游5.7.0/playground5.8.0及KuVibe0.3.3/schema2/各revision保留。

原账务需求计划的1.3.0/1.4.0预期只作历史，本次递增归属独立任务调度需求，其完成时须核对实际版本及并发归属。需求、实现、验收、重要审查发现、当前文档、版本影响与同步、工程记录均完成；仅移除本次task-scheduling active目录，保留其他未完成范围。
