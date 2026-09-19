# Vben 部门持久化与树约束 — Batch M3

Timestamp: `2026-09-08T13:41:49+08:00`

## Problem and context

锁定的 Vben v5.7.0 已声明部门树与新增、修改、删除接口，但项目没有部门实体、路由或业务服务，用户也没有可查询和约束的部门归属。上游 mock 只提供随机树和写入假成功，不能定义持久化不变量、并发行为或删除保护。

## Decision

- 直接按当前业务重构部门映射，不兼容旧表，也不生成或执行迁移；部署方负责创建新表和用户字段。
- 保留 Vben 的 `name/pid/status/remark`，增加可选业务排序 `order`，持久化为 `order_no` 并默认 `0`。
- Bigint ID 在 API 边界保持字符串；状态只接受数值 `0 | 1`。
- 同级活动部门名称唯一，根部门单独适用同一规则；写入使用可串行化事务和父链锁，数据库约束处理最终并发竞争。
- 删除使用 soft delete，存在活动子部门或任何用户引用时拒绝。停用只影响当前部门，不级联修改子部门或用户。

## Alternatives

- 沿用不存在的旧部门模型或补兼容迁移被排除，因为本批已明确由部署方按新实体建表。
- 只按名称排序被排除，因为名称变化会意外改变业务顺序；独立 `order_no` 可稳定表达同级排序意图。
- 级联删除子部门、清空用户部门或停用用户被排除，因为这些动作会把单条部门修改扩大为隐式组织和账号变更。
- 仅依赖前端禁止删除有子节点的按钮被排除，因为并发写入和直接 API 调用仍必须由服务与数据库保护。

## Implementation

- 新增 `SysDeptEntity`：bigint 自关联 `pid`、`name`、smallint `status`、`remark`、`order_no`、审计/软删除列、父级/状态/排序索引及两个活动记录部分唯一索引。
- `SysUserEntity` 新增 nullable bigint `dept_id`、索引和 `onDelete: RESTRICT` 部门关系；未增加迁移文件。
- `DeptModule` 接入 `SystemModule`，发布 `GET /system/dept/list` 和部门 POST、PUT、DELETE，并分别使用 `system:dept:list/create/update/delete`。
- 显式 Swagger DTO 覆盖请求、路径参数和递归响应；写接口继续返回统一 `ResOp<boolean>`。
- 列表将 `createdAt` 映射为 `createTime`，按 `order/name/id` 递归排序；孤儿、自指和历史循环会被确定性归根，保证每条活动记录出现一次且响应 JSON 无环。
- 创建和修改校验 PostgreSQL bigint 范围、完整父链、自引用/后代回挂及同级名称。删除检查活动子部门与包含软删除用户在内的全部引用，避免用户恢复后出现悬空逻辑关系。
- 唯一键、外键、serialization failure 和 deadlock 转换为稳定 HTTP 409；缺失资源为 404，无效父级/字段为 422。
- API、Vben 对接、RBAC、项目概览与活动 M3 计划同步更新。

## Verification

- 部门聚焦 Jest：5 suites / 26 tests passed。
- Core 全量 Jest：21 suites / 124 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 本批所有改动 TypeScript 文件 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 网络重新收集的锁定 v5.7.0 snapshot/fixtures check passed；同标签 diff 报告 `Changes: none`。
- `git diff --check` passed。
- Repository-wide ESLint 仍失败于本批未修改文件中的 78 个既有问题；未改写这些用户代码。VitePress 依赖未安装，因此文档站构建未执行。
- 生产 `tsconfig.json` 直接包含 `*.spec.ts` 却未加载 Jest types，因此直接 `tsc -p tsconfig.json` 会报告既有测试全局类型错误；专用测试 type-check 和正式 Nest build 均通过。
- 未连接真实 PostgreSQL；事务隔离、锁参数、冲突映射、引用检查与 soft-delete 调用已由单元/契约测试覆盖，真实数据库并发集成仍属于 M8。

## Documentation impact

更新现有 API、Vben、RBAC 和概览文档，记录部门字段、排序、权限、树投影、删除限制、非级联状态语义及部署方建表责任。Swagger 是字段级主契约，没有新增平行 API 手册。

## Consequences and follow-ups

M3 部门管理已可供 Vben 页面使用，并为 M5 用户列表的 `deptId` 查询和用户写入提供持久化关系。部署上线前必须先依据实体创建 `sys_dept` 与 `sys_user.dept_id`；下一批可进入 M4 角色分页、CRUD 和事务性菜单授权。
