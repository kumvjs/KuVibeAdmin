# 任务调度独立需求接入记录

记录时间：2026-09-30T19:31:00+08:00。变更集task-scheduling-rabbitmq-20260930独立于points-recharge-orders-plan-20260930。

用户另行要求任务调度后台和RabbitMQ Docker部署，已完成订单worker接入：领域事务仍写outbox，新cron将到期ID确认发布，消费者领取原租约，复用订单到期、支付/退款/对账处理器。普通错误有限重试，渠道pending保持延迟预算；没有直接在业务事务内发布网络消息，也没有支付到账口径变化。此前interval轮询实现描述仅作历史，当前运行以新调度文档为准。

跨实例调度、真实消息确认/恢复、队列取消/重连及重复消息、实际订单到期释放/投影、同秒任务公平队列、跨连接prefetch上限和启动失败资源退出已完成开发隔离验收。Docker本地已应用仅新增任务表的迁移、补齐任务菜单权限和消息配置；原开发凭据/数据卷保留。前端只新增playground业务页，保留既有上游边界修正。

独立需求新增兼容能力minor，实际根/backend从1.3.0统一bumped至1.4.0；这次递增归属于任务调度需求。原账务plan中1.3.0基线及1.4.0预期保留为历史，原M6仍未完成，不能据此重复写入同版本或覆盖其他需求。账务全部门槛完成时须重新核对版本来源、并发归属与最终范围，再执行一次新决定；目前不替它提前升版本或宣称全部完成。

真实微信/支付宝/Apple/Google渠道、生产容量、生产备份恢复与部署仍pending。本active目录及其他既有记录保留。当前使用和诊断入口为docs/modules/task-scheduling.md及docs/modules/billing-operations.md；后端专用集成工具为根test:tasks:integration/test:rabbitmq:integration。
