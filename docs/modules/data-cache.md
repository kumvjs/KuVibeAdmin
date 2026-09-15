# 数据与缓存

## TypeORM 数据层

`DatabaseModule` 通过 `TypeOrmModule.forRootAsync()` 初始化连接，并启用 `autoLoadEntities`。业务实体继承 `CommonEntity`，统一包含：

- `id`：PostgreSQL `bigint`，应用层类型为字符串；
- `createdAt`、`updatedAt`、`deletedAt`；
- `createdBy`、`updatedBy` 审计字段；
- TypeORM `BaseEntity` Active Record 能力。

主要表包括用户、角色、菜单、用户角色、角色菜单、Refresh Token、登录日志和验证码日志。软删除由 `deleted_at` 表示。

`sys_user` 直接保存不可变登录账号、展示名、numeric 状态、部门、备注、时区、可空 `avatar/home_path/description`、Argon2id PHC 哈希和会话版本。`/user/info` 在 DTO 边界映射资料字段且不会暴露凭据；`/system/user/list` 也只返回专用管理 DTO。

## Redis 缓存

`CacheService` 为 Redis 提供类型化 key 与 JSON 序列化封装。`getOrSet()` 同时处理常见缓存风险：

- 使用短期空值占位避免缓存穿透；
- TTL 随机抖动降低集中失效风险；
- `SET NX EX` 分布式锁降低热点 key 击穿；
- Lua 对比锁值后原子解锁，避免误删其他请求的锁；
- `SCAN` 代替 `KEYS` 实现前缀批量删除。

缓存 key 按用途拆分在 `src/shared/cache/keys`，覆盖用户信息、用户权限、Access / Refresh Token、黑名单、密码版本与在线状态。

用户权限缓存使用 `auth:user:permissions:<userId>`，值中包含 `schemaVersion` 和 `codes`。`/auth/codes` 与 `RbacGuard` 共享同一个缓存回源入口：Redis 未命中时从角色菜单关系加载并回填，版本匹配且 `codes` 为空数组代表用户确实没有权限，不能被误判为未命中。旧版无版本数组或未知版本会惰性回源并覆盖，不要求发布时全量清 Redis；未来权限缓存结构或授权语义变化时必须递增 schema 版本。

`AuthService.invalidatePermissionsCache(userId)` 用于定向删除；菜单、角色和用户授权写服务必须在数据库事务成功提交后调用，避免回滚事务提前清除缓存或继续使用旧权限。

用户资料或角色更新会删除 `user:info:<id>` 与 `auth:user:permissions:<id>`。停用、删除或密码重置还按用户前缀扫描删除 Access/Refresh Token 状态、清理在线 key，并先更新或删除 `auth:user:password_version:<id>`，使旧 JWT 立即无法通过会话版本检查；数据库 Refresh Token 在同一写事务中删除。

## 系统附件与上传策略

独立 `UploadModule` 在所有环境注册，提供策略管理、多格式流式上传、鉴权下载、附件管理、头像绑定及引用安全清理。部署和访问语义详见[系统附件](./attachments.md)。

新增四张实体表由部署方创建，不生成迁移或自动执行业务 DDL：

- `sys_upload_policy`：按用途保存启停、格式白名单、单文件/请求总大小、数量、可见性、保留期与版本。
- `sys_attachment`：附件存储标识、上传人、原始文件信息、校验和、策略版本、生命周期与扫描状态。
- `sys_attachment_reference`：附件与业务记录的引用，限制直接物理删除仍被引用的附件。业务存在性和访问权限还需业务服务验证。
- `sys_attachment_audit`：上传、绑定/解绑、删除请求和下载授权审计。

策略管理通过 Swagger 中的“上传策略”接口操作，读取/写入分别要求 `system:upload-policy:read` / `system:upload-policy:write`，使用标准 `ResOp`。写入为完整替换而非部分更新，事务提交后失效缓存。当前不会自动创建默认策略，也不从环境变量读取业务设置；新上传服务入口将拒绝缺失或禁用的用途。

策略支持常见格式配置并执行相应内容校验。默认设计为私有附件；只有 `avatar` 图片策略可以配置为公开，且仍需完成业务绑定。业务实际大小限制来自数据库，上限受实现的资源安全边界约束（单文件/请求总量最大 1 GiB、最多 20 个文件、保留期最多 30 天）。旧 Playground 上传已移除，不再应用固定 6 MiB/24 小时规则。

Redis 使用独立用途 key、随机代际标识与 Lua 条件回填，不直接复用无法防止更新后旧数据回填的通用 `getOrSet()`。命中不查策略表，同进程同用途并发查询合并。缓存最长 60 秒，缺失策略也缓存；读入策略需重新验证结构和业务约束。

缓存失效在提交后重试三次，全部失败会告警并返回说明“策略已保存”的 503；旧缓存最多保留 60 秒，可重试保存刷新。Redis 读取故障时每进程每秒最多发起一次降级回源，回填失败则短暂熔断；无法取得有效策略时返回 503，不放宽上传限制。数据库与 Redis 之间不是原子事务，直接手工改表不会触发主动失效。

## 审计与日志

HTTP traceId 通过 `AsyncLocalStorage` 在请求链路中传递。登录成功后会记录 IP、User-Agent 和 IP 地址解析结果；地址解析失败不会阻断登录。TypeORM 使用自定义 Logger 输出数据库日志。

::: warning 多实例注意
缓存锁基于 Redis，可跨进程；但 WebSocket 在线会话当前仅保存在进程内存。多实例实时通信仍需 Socket.IO Redis Adapter 和共享在线状态，代码中的 Adapter 接入目前被注释。
:::
