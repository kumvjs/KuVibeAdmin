# Vben 用户管理、Argon2id 与会话撤销 — Batch M5

Timestamp: `2026-09-08T19:13:51+08:00`

## Problem and context

锁定的 Vben v5.7.0 用户页需要 `{ items,total }` 分页、部门筛选、状态切换和 CRUD，但项目仍使用 `nestjs-paginate`、实体响应和空写 DTO。用户实体同时保留 boolean status、冗余 role、盐化 MD5 与 psalt；角色分配、最后 super 保护和管理端强制下线均未实现。

## Decision

- 按部署方要求直接重建用户相关表，不生成迁移或兼容旧 MD5 数据。
- Vben `name` 是可编辑展示名；新增独立、不可变的登录 `username` 和创建必填 `password`。
- 上游用户类型虽声明 `permissions`，锁定表单并未绑定它；后端采用明确 `roleIds` 并保持 user → role → menu RBAC，不增加直接用户菜单授权。
- 用户 status 保存为 smallint `0 | 1`；部门与角色必须存在且启用，创建至少分配一个角色。
- 密码只使用 Argon2id PHC，默认参数不低于当前 OWASP 下限，并允许环境变量在下限以上调优。
- 停用、密码重置和删除强制撤销全部现存会话；最后一个启用 super 管理员不能被破坏。

## Alternatives

- 将 Vben `permissions` 解释为菜单 ID 并增加 `sys_user_menu` 被否决，因为项目没有定义直接授权与角色授权的 union/override 规则，且锁定表单实际不会提交该字段。
- 把 `name` 同时作为登录名和展示名被否决，因为普通资料编辑将不可预期地改变登录身份。
- 生成固定默认密码或静默生成无法回显的密码被否决；创建接口明确要求 12–128 字符初始密码。
- 保留 MD5 双验证器被否决，因为部署方明确重建表；若未来要保留旧用户，应单独审批迁移，而不是扩大 fresh-table 边界。
- 仅删除 Redis token key 被否决；持久化 session version、数据库 Refresh Token 和用户缓存必须一起收敛。

## Implementation

- `SysUserEntity` 改为 username/name/password_hash/password_algorithm/session_version/status/dept_id/remark/timezone/profile 新模型，加入状态、算法、PHC 前缀、正 session version checks 和活动 username 部分唯一索引。
- 新增维护中的 `argon2@0.45.1`，哈希统一使用 Argon2id `m=19456,t=2,p=1,hashLength=32`；四项参数可由 `PASSWORD_ARGON2_*` 环境变量上调，Joi 拒绝低于安全下限的配置。
- 初始化脚本和登录验证移除 MD5、psalt 与冗余 role，登录 Token 使用实体持久化 session version。
- Refresh Token 轮换增加数据库用户状态和 session version 校验；JWT 用户解析同时拒绝 numeric disabled 用户。
- 新增用户 GET/POST/PUT/DELETE 及独立查询、参数、写入、响应 DTO，四个路由分别使用 `system:user:list/create/update/delete`。
- 列表实现全部锁定 Vben 查询、稳定 createdAt/id 排序、bigint 字符串与排序后的 roleIds 投影。
- 创建/更新在可串行化事务中锁定部门和角色；提交 roleIds 时 hard-replace `sys_user_role`，省略则保留。
- 密码重置或 enabled → disabled 递增 session version 并删除数据库 Refresh Token；删除清理 Refresh Token、用户角色映射并 soft-delete 用户。
- 提交后定向清理用户信息和权限缓存；强制下线还清理 token 前缀、在线 key 与会话版本 cache，不扫描无关用户。
- 最后 super 校验覆盖停用、角色移除和删除，并在 serializable 事务内通过锁定查询抵御并发 write skew。
- Refresh Token value/userId 取得命名唯一/普通索引，用户外键及 user-role 用户外键明确使用 CASCADE 作为最终 hard-delete safeguard。
- Swagger、Vben、RBAC、数据缓存、概览和活动计划同步更新。

## Verification

- M5/Auth focused Jest: 8 suites / 41 tests passed。
- Core full Jest: 31 suites / 180 tests passed（Node ESM 依赖下通过 `NODE_OPTIONS=--experimental-vm-modules` 执行）。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- M5 changed-file ESLint passed。
- Nest build passed。
- Vben contract parser tests（3/3）、v5.7.0 locked contract check 和同 tag diff 均通过；同 tag 无接口变化。
- `git diff --check` passed。
- Argon2id native binding smoke test passed；本机默认参数约 25 ms，这不是生产容量结论。
- 仓库全量 ESLint 仍有 62 个既有错误，均不在本批变更文件；变更文件定向 ESLint 为零错误。
- 文档内容已更新，但当前 workspace 没有安装 VitePress 可执行文件，因此未执行文档站构建。
- 未连接真实 PostgreSQL/Redis；事务、锁、映射替换、缓存调用和错误映射由单元/契约测试覆盖，真实并发与集成验证仍属于 M8。
- 未生成或执行数据库迁移。

## Documentation impact

更新 API、Vben 对接、RBAC、数据缓存与概览，记录用户字段、roleIds 适配、numeric status、Argon2id、会话撤销、最后 super 保护和部署方建表责任。Swagger DTO 仍是规范接口契约。

## Consequences and follow-ups

M5 后端用户管理已闭环。部署方必须按新实体直接建立用户、用户角色和 Refresh Token 约束；已有 MD5 用户不能直接复制。Vben 用户表单还需增加 username、password 和角色选择。M6 可复用已持久化 timezone 字段实现 IANA 时区偏好接口。
