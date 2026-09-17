# 认证与 RBAC

## 登录与令牌

登录使用用户名和密码。新用户表只保存 Argon2id PHC 哈希；只有密码正确且 `sys_user.status=1` 才会生成两类令牌。未知账号和密码错误始终返回相同凭据错误，停用状态只在该账号密码已经验证后返回，减少账号状态枚举。

- Access Token 返回给前端，由请求头 `Authorization: Bearer <token>` 携带。
- Refresh Token 写入 `refresh_token` HttpOnly Cookie，并在 PostgreSQL 与 Redis 中保留状态。

刷新令牌采用轮换机制：数据库原子删除旧 Refresh Token 是一次性消费点，只有成功删除一条记录的请求才能生成新的 Access Token 与 Refresh Token，因此旧令牌的并发请求或重放不会产生第二组令牌。退出登录会把当前 JWT UUID 加入 Redis 黑名单，清理 Access Token 状态，撤销请求 Cookie 对应的 Refresh Token，并清除浏览器 Cookie。

登录与刷新均返回统一 `ResOp`，Access Token 位于 `data.accessToken`；Vben 前端的 OpenAPI 客户端在统一拦截器中解包 `data`。`/user/info` 使用专用响应 DTO 将数据库 `id` 映射为字符串 `userId`，不会直接暴露用户实体和审计字段。

账号停用、删除和密码重置会撤销该用户的持久化 Refresh Token、递增或清理会话版本，并在提交后删除 Redis 令牌、在线状态、用户信息和权限缓存。仅由运维直接修改数据库状态仍不会执行这些提交后动作。

JWT 校验还会检查：

- Redis 中是否仍有 Access Token 记录；
- JWT 是否处于黑名单；
- 用户密码版本是否与缓存一致；
- 单端登录模式启用时，是否为当前有效 Token（当前配置固定允许多端登录）。

::: warning 当前安全边界
图片验证码校验仍被注释。Argon2id 默认参数只代表当前 OWASP 下限，生产发布前仍需用生产同等级硬件压测并通过 `PASSWORD_ARGON2_*` 环境变量上调成本。
:::

浏览器安全配置按环境管理：凭据 CORS 使用精确 Origin，生产要求 HTTPS 与 Secure Cookie，Cookie Domain 默认不设置，SameSite 可按同站/跨站部署选择。全局可信 Origin 守卫在 JWT 和业务逻辑之前拒绝来自非白名单 Origin 的非安全方法；没有 Origin 的 CLI/服务间调用不受影响。

## 密码哈希模型

用户模型采用 Argon2id-only，正式版提供新安装基础迁移，不加载旧 MD5，也不保留 `psalt`。`password_algorithm` 必须为 `argon2id`，`password_hash` 必须为 PHC 字符串；新建、初始化和管理端重置都走相同哈希入口。

默认参数为 `m=19456 KiB,t=2,p=1,hashLength=32`，达到当前 [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 的最低建议。`PASSWORD_ARGON2_MEMORY_COST/TIME_COST/PARALLELISM/HASH_LENGTH` 只能设置为不低于该下限的整数；PHC 参数变化可通过 `needsRehash` 识别。开发机 smoke benchmark 不能代替生产硬件容量和延迟测试。

如果某个部署必须保留旧用户，需另立迁移项目并实现经审核的混合验证和强制重置，不能复制旧哈希或使用 `argon2(md5(password))` 冒充迁移。本仓库当前 fresh-table 路径会直接拒绝非 Argon2id 算法。

## RBAC 数据模型

```text
sys_user ───────> sys_dept（nullable，删除 RESTRICT）
   │
   └──< sys_user_role >── sys_role ──< sys_role_menu >── sys_menu.auth_code
```

`sys_menu.auth_code` 是 Vben 的 `authCode` 持久化列，每行只保存一个权限码。查询会去空、去重并稳定排序；角色关联产生的重复行优先在 PostgreSQL 中去重。有效权限只来自启用角色关联的启用菜单或按钮。启用的 `super` 角色不要求建立逐项角色菜单关联，而是获得全部启用菜单/按钮权限码，和后端守卫的超级用户放行语义保持一致。守卫只根据启用角色关系生成的 `roleCodes` 判断 `super`，不会信任 `sys_user.role` 的旧冗余值。

用户登录时，系统按数据库最新状态查询权限并写入带 schema 版本的 Redis 缓存。后续 `/auth/codes` 与 `RbacGuard` 共用缓存回源逻辑：版本匹配的命中（包括空 `codes`）直接使用，旧版或未命中值查询 PostgreSQL 并回填。`invalidatePermissionsCache(userId)` 提供按用户失效入口；后续菜单、角色和用户授权写操作必须在事务提交后调用。`RbacGuard` 读取 `@RequirePermissions()` 元数据，数组权限使用“全部满足”语义。

## 菜单持久化模型

`sys_menu` 作为新表按 Vben 语义直接建模，只保留 `pid`、`name`、`path`、`auth_code`、`type`、`component`、`redirect`、`meta` 和 `status`，并通过 bigint `pid` 自关联。`type` 使用 Vben v5.7.0 的五个字符串值：`catalog`、`menu`、`embedded`、`link`、`button`；`status` 直接保存 Vben 使用的 smallint `0 | 1`。Bigint ID 在 API 边界始终保持字符串。

图标、排序、缓存、显隐、徽标、外链与 iframe 等前端路由展示配置存入 PostgreSQL JSONB `meta`。这样新增 Vben 元数据不会反复改表；只有需要唯一约束、索引、关系或后端业务查询的字段才提升为普通列。`name`、非空 `path` 和非空 `auth_code` 由唯一索引兜住并发写入，父菜单删除使用 `RESTRICT`。

菜单新增、修改、删除均在可串行化事务中执行。父链会逐级校验并锁定，只允许 catalog/menu 作为父级；自引用、后代回挂、损坏的祖先循环以及把已有子节点的节点改成叶子类型都会被拒绝。类型规则要求所有菜单有 `meta.title`，menu 有本地 path 和安全组件，embedded/link 有安全 HTTP(S) 目标，button 有父级和分段权限码。删除采用软删除，并在仍有活动子节点或角色菜单引用时拒绝操作。

提交菜单写事务后，服务定向删除受该菜单启用角色映射影响的用户和启用 super 角色用户的 `auth:user:permissions:*` 缓存。创建时尚无普通角色映射，因此只查询 super 用户；整个流程不扫描 Redis。角色授权映射的后续写服务仍需复用同一提交后失效原则。

本次明确不迁移旧菜单数据，也不保留旧数字类型、逗号权限码或外链字段兼容层。使用方需要通过项目的数据库初始化流程重新创建 `sys_menu` 及其角色菜单关联数据；该操作会丢弃旧菜单配置，执行实际删表/重建前必须由部署人员确认并备份。本代码变更不会主动操作任何数据库。

## 部门持久化模型

`sys_dept` 使用 bigint `pid` 自关联，持久化 `name`、numeric `status`、`remark` 与整数 `order_no`，并继承审计和软删除字段。根部门名称、同一父级下的部门名称分别由仅覆盖未软删除记录的部分唯一索引保护；父部门与 `sys_user.dept_id` 的外键删除策略均为 `RESTRICT`。

部门写服务通过可串行化事务、父链锁和数据库约束共同保护树结构及并发唯一性。删除前检查活动子部门和全部用户引用；修改 `status` 不操作子部门、用户、角色或权限缓存。部门表与用户归属字段包含在正式版基础迁移中，由部署方审查后执行。

## 角色持久化与授权

`sys_role` 将不可变的机器标识 `code` 与可编辑显示名 `name` 分离。`status` 使用 Vben numeric `0 | 1`，`is_default` 由部署初始化维护。code 跨软删除保持唯一，避免角色身份被回收复用；name 只在活动记录中唯一。公开创建接口不能占用 `super/admin/user` 系统保留码，未提供 code 时生成 `role:<uuid>`。

角色权限表单中的 `permissions` 是 `sys_menu` ID，不是 `auth_code` 字符串。更新先锁定并确认所有菜单仍存在，再 hard-delete 旧 `sys_role_menu` 并插入新集合；整个替换与角色更新处于同一个可串行化事务。未提交 permissions 的局部更新保留原映射。

`super` 和 `is_default=true` 角色不能停用或删除，普通角色存在任何用户关系时也不能删除。`sys_user_role` 使用命名的用户/角色索引、唯一用户角色对以及 `role_id ON DELETE RESTRICT`。角色更新提交后，只失效当前分配该角色用户的 `auth:user:permissions:*` 缓存。角色停用不改写用户账号或 `sys_user_role`；权限变化由下一次缓存回源立即反映。角色相关表和外键包含在正式版基础迁移中，由部署方审查后执行。

## 用户管理与角色分配

系统用户以不可变 `username` 登录，以可编辑 `name` 供 Vben 展示；numeric `status`、`dept_id`、`remark`、`timezone` 和已有资料列直接持久化。用户名只在未软删除记录中唯一。API 使用 `roleIds` 覆盖写入 `sys_user_role`，不接受上游含义不明且未绑定表单的用户 `permissions`，也不建立 `sys_user_menu`。

用户创建和角色替换会在可串行化事务中锁定并验证启用部门与全部启用角色。任何更新提交后失效用户信息和权限缓存；停用、密码重置和删除还撤销全部会话。删除会清理用户角色映射后软删除用户。若目标是当前启用的 super 用户，服务会确认仍有另一名启用 super，否则拒绝停用、删除或角色移除。

```ts
@RequirePermissions('system:user:list')
@Get('list')
list() {}

@RequirePermissions('system:user:update', 'system:user:audit')
@Post('review')
review() {}
```

未标注 `@RequirePermissions()` 的已认证接口只要求有效登录，不进行细粒度权限判断。`@Public()` 可同时跳过 JWT 与 RBAC Guard。

## 当前完成度

- 用户信息、有效权限码查询和完整用户分页/CRUD 已有接口。
- `/auth/codes` 返回菜单/按钮 `authCode` 数组，不返回角色 code；角色身份仍由 `/user/info.roles` 表达。
- `/menu/all` 从启用角色映射生成动态路由树，补齐授权节点的有效祖先；超级角色获得全部有效路由。
- `/system/menu/list` 使用 `system:menu:list` 保护，返回包括按钮和停用项在内的完整管理树。
- `/system/menu/name-exists` 与 `/system/menu/path-exists` 复用 `system:menu:list`，供菜单管理表单执行唯一性预检查。
- `/system/menu` 的 POST、PUT、DELETE 已分别使用 `system:menu:create`、`system:menu:update`、`system:menu:delete`，成功响应为统一 envelope 中的 boolean。
- `/system/dept/list` 及部门 POST、PUT、DELETE 已使用各自 `system:dept:*` 权限，提供稳定部门树和受约束的持久化写入。
- `/system/role/list` 及角色 POST、PUT、DELETE 已使用各自 `system:role:*` 权限，提供 Vben 分页、局部状态更新和事务性菜单授权。
- 菜单实体已采用 Vben 五类型、JSONB 元数据、numeric 状态与 bigint `pid` 自关联；权限查询服务和按用户缓存失效入口已经存在。
- 角色实体采用不可变 code、numeric 状态和活动名称唯一约束；角色授权变更会在提交后定向失效受影响用户权限缓存。
- 菜单、部门、角色和用户 Swagger DTO 已接入管理查询和 CRUD。
- 菜单、角色和用户写服务均执行定向权限缓存失效；用户停用、删除和密码重置还强制撤销已有会话。
