# v2 技术分析与决策草案

## 现状证据

- 2026-09-18 经用户指出后补查：Vben 已有通知 UI，且本项目锁定的 v5.7.0 / `63a38dce49ba109f61607994e21ba921d8e970e9` 也已存在，并非仅 main 新增。此前只查 API 契约，漏查布局与组件，证据链不完整。
- [锁定版本 basic.vue](https://github.com/vbenjs/vue-vben-admin/blob/63a38dce49ba109f61607994e21ba921d8e970e9/playground/src/layouts/basic.vue#L35) 中 `notifications` 是本地演示数组；已读、移除、清空和全部已读处理函数只修改该数组，`viewAll` 是空函数。这些处理函数未调用通知后端。用户提供的 main 对应文件也具备这些通知交互。
- [锁定版本 Notification 组件](https://github.com/vbenjs/vue-vben-admin/blob/63a38dce49ba109f61607994e21ba921d8e970e9/packages/effects/layouts/src/widgets/notification/notification.vue) 已提供铃铛、未读圆点、列表及操作事件。结论应是：复用现有通知组件，给演示交互补齐真实服务端能力；不能把 UI 当作缺失功能，也不能仅凭已收集 API 契约推断整个上游没有相关能力。
- `packages/core/src/modules/websocket/ws-push/ws-push.service.ts` 已提供按用户推送；这是传输基础，不是具备历史、已读和投递保证的通知系统。
- `packages/core/src/modules/system` 已有用户、角色、菜单、部门；`modules/upload` 已有附件与策略。v2 应复用身份和授权体系。
- 当前普通用户创建要求显式 roleIds；isDefault 仅表示受保护角色，不意味着自动注册或自动分配。v2 如引入自助注册，另行定义默认角色赋予规则。

## 现有组件的接入映射（规划）

[NotificationItem 类型](https://github.com/vbenjs/vue-vben-admin/blob/63a38dce49ba109f61607994e21ba921d8e970e9/packages/effects/layouts/src/widgets/notification/types.ts) 支持字符串 ID。接入时保留 bigint 字符串；服务端返回时间点，由前端格式化 date，readAt 映射为 isRead，正文摘要映射为 message。avatar 使用安全来源或默认图，不直接复制演示地址。

| 现有输入/事件 | v2 建议补齐的行为 |
| --- | --- |
| notifications / dot | 拉取当前用户最近通知；dot 根据服务端未读总量计算，不能只看当前页 |
| read / makeAll | 持久化单条/截点之前全部已读，失败恢复 UI；其他设备刷新状态 |
| remove / clear | 建议按当前接收者隐藏单条/截点之前通知，保留其他接收者和通知内容；语义须在 M0 确认 |
| onClick | 使用受约束的站内跳转；是否点击即已读需明确，不能假定组件自动完成 |
| viewAll | 连接个人历史列表；上游这里是空回调，完整消息中心属于待补功能 |

接收记录如支持移除/清空，需增加接收者级隐藏状态及查询/未读计数规则。铃铛位于布局插槽，不需要新增系统管理菜单。完整消息中心与通知发布管理页是另外的扩展，不能与已有弹层混为一谈。

## 推荐模型（未创建实体或迁移）

| 概念 | 关键职责与约束 |
| --- | --- |
| 通知内容 | 标题、正文、业务类型、创建人、草稿/已发布状态、发布时间；发布后冻结内容 |
| 接收记录 | notificationId、recipientId、readAt；二者联合唯一；按接收者/时间/ID 分页索引与未读查询索引 |
| 发布任务/投递事件 | 幂等键唯一、状态、重试次数、下次执行时间、错误摘要；承载批量接收者展开与推送重试 |

小批量发布在事务中冻结内容并生成接收记录和待推送事件；大批量采用可恢复任务，固定接收者快照，分批唯一键去重。发布状态必须区分处理中、完成和失败，不能因为收到请求就报告全部送达。先明确容量再选取批量阈值，不在计划中承诺无限广播。

PostgreSQL 是事实来源；Redis/Socket.IO 只传递更新提示。事务提交后消费 outbox，按用户推送通知 ID 和最少摘要，客户端再读 HTTP。推送允许至少一次，客户端按 ID 去重；断线或丢失事件通过 HTTP 增量/分页补拉恢复。多实例部署需核验现有 ws-session 和跨实例分发，未验证前不能宣称支持。

首期未读数量从接收记录查询，避免先引入容易漂移的 Redis 计数。全部已读按服务端截点更新已有记录，新到消息保持未读；单条已读幂等。并发读写用数据库条件更新，接收者越权统一不可访问。

## 权限与路由草案

- 个人消息中心：登录即可调用自己的读取/已读能力；不赋予 `system:notification:*`，不复用 `system:attachment:read`。
- 后台通知管理：候选 `system:notification:list/create/update/publish`，分离草稿编辑与发布；需接口和前端动作一起评审后再登记。
- 个人页面与后台管理页面分别接入，动态菜单只在组件真实存在并联调通过后初始化。
- 发布与失败重试写审计记录，禁止日志记录完整私信正文；指标包括投递延迟、失败积压、重复抑制、未读查询耗时。

## 方案取舍

以下 outbox、批量发布、公告及运营管理均是生产能力的设计建议，不是从 Notification 组件源码推导出的既定业务需求；在 M0 评审范围、容量和成本后再决定。

推荐持久接收记录 + outbox：可恢复且容易按用户隔离。只用 WebSocket 无法保证离线可见；Redis-only 不适合作为历史和已读事实来源；首期直接引入外部消息平台会增加部署依赖，暂不选择。沿用 NestJS、TypeORM、PostgreSQL、Redis、Socket.IO，不更换技术栈。

未来表结构变化需 Atlas Skill、可逆迁移、数据保留审查及隔离库验证。前向兼容发布先部署表和后端，再接前端和启用菜单；回滚优先关闭入口/消费者并保留通知记录，不以删表回滚线上数据。
