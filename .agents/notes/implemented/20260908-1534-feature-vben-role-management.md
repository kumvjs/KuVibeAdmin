# Vben 角色管理与事务授权 — Batch M4

Timestamp: `2026-09-08T15:34:20+08:00`

## Problem and context

锁定的 Vben v5.7.0 角色页需要筛选分页、状态切换、CRUD 和菜单权限树，但项目角色 Controller 仍为空，DTO 只是骨架，角色状态还是与 Vben 不一致的 boolean，角色菜单更新和权限缓存失效也没有业务入口。上游写接口只有调用声明而没有 mock 实现，不能作为生产事务和保护规则。

## Decision

- 按新表重构 `sys_role` 及角色关联映射，不兼容旧角色表，不生成或执行迁移；部署方负责建表。
- Vben `status` 直接保存为 smallint `0 | 1`，`permissions` 明确定义为 `sys_menu.id` 数组。
- 不可变、跨软删除唯一的 `code` 与活动记录唯一的可编辑 `name` 分离；未提供 code 时生成 `role:<uuid>`。
- `super/admin/user` 是公开创建接口不可占用的保留码；`super` 和 `is_default=true` 的角色不可停用或删除。
- 权限集合采用可串行化事务完整替换，省略 permissions 的局部 PUT 保留原映射。
- 每次角色更新提交后定向失效全部当前分配用户的权限缓存，不扫描 Redis。

## Alternatives

- 从可编辑角色名派生并持续同步 code 被否决，因为重命名会改变授权身份并使已有 Token/配置语义不稳定。
- 复用 Vben 上游接口错误声明的裸数组返回类型被否决；其分页 Grid 和本项目冻结契约要求 `{ items,total }`。
- 逐条增删角色菜单且允许部分成功被否决，因为失败会留下前端从未提交过的混合授权状态。
- 删除角色时级联删除用户角色关系被否决，因为这会把一个删除动作扩大成未确认的用户授权变更。
- 角色停用时停用用户或删除映射被否决；角色查询即时排除 numeric disabled 状态，缓存失效足以让授权收敛。

## Implementation

- `SysRoleEntity` 改为 `code/name/status/remark/is_default` 新模型，加入 numeric status check、活动名称部分唯一索引、全局 code 唯一索引和状态/default 索引。
- `sys_user_role` 使用命名索引、命名唯一用户角色对和显式 `role_id ON DELETE RESTRICT`；`sys_role_menu` 继续使用 bigint 外键、唯一角色菜单对和 restrictive menu relation。
- 新增 `GET /system/role/list`，验证全部 Vben 查询参数，执行转义后的 ILIKE 筛选、精确 bigint ID、ISO 时间范围、稳定分页，并返回 `{ items,total }` 和排序后的权限 ID。
- 新增角色 POST、PUT、DELETE，分别要求 `system:role:create/update/delete`，成功结果保持 `ResOp<boolean>`。
- 创建支持可选 custom code 或生成 code；更新 DTO 明确移除 code，即使服务被直接调用也保留当前 code。
- 写事务锁定角色和全部提交菜单，验证 PostgreSQL bigint 范围与菜单存在性，然后 hard-replace `sys_role_menu`。空数组清空权限，缺少字段保持权限。
- 保护 super/default 状态与删除，删除时包含软删除记录检查全部用户角色引用；无引用角色先清理菜单映射再 soft-delete。
- 更新角色后事务内收集 distinct assignee IDs，提交后分批删除 `auth:user:permissions:*`；数据库唯一、外键、serialization 和 deadlock 错误映射为稳定 HTTP 409。
- 菜单权限查询、动态路由、用户角色查询与初始化脚本同步改用 `RoleStatus.ENABLED`，避免 PostgreSQL smallint/boolean 比较错误。
- Swagger、API、Vben、RBAC、概览和活动计划同步更新。

## Verification

- M4/RBAC 聚焦 Jest：8 suites / 38 tests passed。
- Core 全量 Jest：26 suites / 154 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 本批所有改动 TypeScript 文件 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 网络重新收集的锁定 v5.7.0 snapshot/fixtures check passed；同标签 diff 报告 `Changes: none`。
- `git diff --check` passed。
- Repository-wide ESLint 仍失败于本批未修改文件中的 66 个既有问题；M4 已消除原角色骨架中的未使用 import/格式错误，未改写其余用户代码。
- VitePress 依赖未安装，因此文档站构建未执行；Markdown 内容和 diff 格式已检查。
- 未连接真实 PostgreSQL/Redis；事务隔离、锁参数、授权替换、回滚错误映射和缓存失效调用已由单元/契约测试覆盖，真实并发和 Redis 集成仍属于 M8。

## Documentation impact

更新 API、Vben 对接、RBAC 和项目概览，记录角色分页字段、不可变 code、numeric status、默认/超级角色保护、权限替换、缓存失效和部署方建表责任。Swagger 使用专用查询、响应和写 DTO 作为主接口契约。

## Consequences and follow-ups

M4 角色管理已可供 Vben 页面使用，角色状态与菜单/权限查询使用同一 numeric 语义，授权提交后用户不会继续命中旧权限缓存。部署上线前必须依据实体重建 `sys_role`、`sys_role_menu`、`sys_user_role` 约束；下一批 M5 可复用这些角色 ID、部门关系和缓存失效规则实现用户管理。
