# Vben 菜单 CRUD 与父子不变量 — Batch M2.6

Timestamp: `2026-09-08T12:47:28+08:00`

## Problem and context

M2.3–M2.5 已提供动态菜单、管理树和名称/路径预检查，但 Vben v5.7.0 菜单表单仍无法持久化新增、修改或删除。已有 DTO 只表达字段外形，没有执行五种类型的条件规则；服务也没有保护父链循环、叶子节点转换、删除引用或并发唯一写入。

## Decision

- 保持项目统一 `ResOp<T>` 约定，三个写接口的业务结果均为 boolean。
- 按锁定的 Vben v5.7.0 表单语义直接校验五类型，不新增第二套领域模型。
- 使用可串行化事务、当前行写锁与父链读锁保护多步校验；数据库唯一索引仍是并发写入的最终裁决。
- 删除采用 TypeORM soft delete，与 M2.5 的有效记录部分唯一索引保持一致。
- 写事务提交后定向失效受影响普通用户和启用 super 用户的权限缓存，不扫描 Redis 全量键。

## Alternatives

- 只依赖前端 `name-exists`/`path-exists` 被否决，因为预检查无法防止并发写竞争，也没有 authCode 预检查。
- 级联删除子菜单或角色映射被否决，因为会隐式扩大权限变更范围。
- 把 link 路径强制设为必填被否决，因为锁定的 v5.7.0 新建表单不暴露该字段；已有 link path 在修改时会保留。
- 为缓存失效扫描全部 Redis 权限键或制造 `AuthService`/`MenuService` 循环依赖被否决；服务通过启用角色映射查询受影响用户，并直接复用共享 cache/key 原语。

## Implementation

- 新增 `POST /system/menu`、`PUT /system/menu/:id`、`DELETE /system/menu/:id`，分别要求 `system:menu:create`、`system:menu:update`、`system:menu:delete`。
- 新增正 PostgreSQL bigint 路径参数 DTO；强化 name、path、redirect、authCode、component、linkSrc 和可扩展 JSONB meta 的 DTO/服务双层验证。
- 所有类型要求 `meta.title`；catalog/menu/embedded 要求 path，menu 要求 component，embedded/link 要求无用户凭据的 HTTP(S) 地址，button 要求父级与冒号分段 authCode。
- 顶层 `activePath`/`linkSrc` 归并到 `meta.activePath`、`meta.iframeSrc` 或 `meta.link`，类型变更时移除互斥的旧元数据。
- 父级必须存在且只能是 catalog/menu。完整祖先链拒绝自引用、后代回挂和既有损坏循环；有子节点的记录不能改成 embedded/link/button。
- 软删除前检查活动子节点和活动 `sys_role_menu` 引用。唯一键、外键、serialization failure 和 deadlock 均映射为明确的 HTTP 409。
- 事务内收集受影响菜单角色用户与启用 super 用户，事务成功返回后分批删除其权限缓存；新建菜单只影响 super 用户。
- Swagger DTO、Vben/RBAC/API 当前文档以及活动计划同步更新。

## Verification

- 菜单聚焦 Jest：7 suites / 65 tests passed。
- Core 全量 Jest：16 suites / 98 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 本批所有改动 TypeScript 文件 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 网络重新收集的锁定 v5.7.0 snapshot/fixtures check passed；同标签 diff 报告 `Changes: none`。
- `git diff --check` passed。
- Repository-wide ESLint 仍失败于本批未修改文件中的 78 个既有问题；未改写这些用户代码。VitePress 依赖未安装，因此文档站构建未执行。
- 未连接真实 PostgreSQL/Redis；事务隔离、锁参数、冲突映射和软删除调用已由单元/契约测试覆盖，真实数据库并发集成仍属于 M8。

## Documentation impact

更新现有概览、API、Vben 对接和 RBAC 文档，记录已开放路由、权限码、五类型字段规则、HTTP 409 与删除限制。Swagger 仍是字段级接口契约，没有新增平行 API 手册。

## Consequences and follow-ups

菜单现已可安全持久化和编辑，预检查不再是唯一完整性防线，权限码缓存也会在菜单提交后定向失效。M2 的菜单与权限骨架已完成；下一阶段可进入 M3 部门持久化，角色授权映射的缓存失效仍由 M4 写服务负责。
