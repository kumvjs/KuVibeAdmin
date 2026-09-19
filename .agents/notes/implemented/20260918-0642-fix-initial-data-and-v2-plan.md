# 初始化数据修复与 v2 规划

时间：2026-09-18T06:42:56+08:00。

## 需求与决策

用户确认“修复初始化数据，并规划 v2”。现有 setup 只建超级用户，已有超级用户时直接跳过，无法补齐菜单、普通角色和根部门。

按锁定 Vben v5.7.0 / 63a38dce49ba109f61607994e21ba921d8e970e9 的 [系统路由](https://github.com/vbenjs/vue-vben-admin/blob/63a38dce49ba109f61607994e21ba921d8e970e9/playground/src/router/routes/modules/system.ts) 与 [菜单 mock](https://github.com/vbenjs/vue-vben-admin/blob/63a38dce49ba109f61607994e21ba921d8e970e9/apps/backend-mock/utils/mock-data.ts) 核对页面。以本项目控制器的权限常量为权威，不复制上游示例账户、示例权限和无实际业务页面。

## 实现与安全边界

- setup-data：System 目录、部门/菜单/角色/用户四页、16 个对应权限、3 个附件和 2 个上传策略权限，总共 22 个菜单/按钮节点、21 个权限码。
- 创建 user 普通默认角色，清理其 system:* 及管理路由授权，保留业务权限和其他角色授权。super 已有运行时全权限逻辑不变；不创建额外 admin/演示账号；用户创建 roleIds 契约不变。
- 复用启用根部门，缺失则创建 pid=null 根部门；新超级用户关联它，不调整既有用户部门。
- SERIALIZABLE 基础数据事务，重复运行保留元数据；停用/软删除/标识冲突及其他默认角色冲突均报错回滚，不复活或覆盖。
- 已有超级用户仍执行补齐；不修改已有账号密码和密钥。基础数据与账号创建为两个事务。
- 数据提交后定向清理 user/super 关联用户权限缓存，每次重跑均重新计算目标，缓存失败可以重试。必须在停服维护窗口执行，避免并发写入和缓存重填；不宣称在线无竞态修复。
- 不修改表结构或历史迁移；不在业务数据库执行 setup。隔离测试使用随机数据库和实体同步，不替代现有迁移验证。

## 验证与审查

- 17 项聚焦 Jest 测试通过：setup 交互、缓存清理/失败、RBAC 与菜单运行时。
- PostgreSQL 17 独立实例真实集成通过：完整性、重复执行、实际有效权限和动态路由、普通授权清理、其他角色/元数据保留、事务回滚及冲突。初次测试因测试账户假密码不满足数据库约束失败，改为真实 setPassword 后通过。
- pnpm typecheck、pnpm build、修改脚本的 ESLint、pnpm docs:build、git diff --check 通过。
- 审查覆盖：权限不向默认用户泄露、未来页面不提前注册、失败状态真实、bigint 保留字符串、已有数据安全；未运行真实 Vben 浏览器和业务数据库初始化，未进行线上规模/并发演练。

## 文档与后续

更新快速开始、Vben 接入、专项验收入口和 README。v2 的 requirement/analysis/plan/acceptance 保留在 `.agents/notes/active/v2/`，首个闭环为持久站内信、已读与接收者隔离、可靠推送和前端联调；容量、保留时间、多实例范围待进入开发前冻结。当前没有通知实体、迁移、API、菜单或业务实现。

## 版本与完成检查

变更集 initial-data：patch / bumped；根 package.json 与 packages/backend/package.json 统一 1.2.0 → 1.2.1。原因是已交付模块初始化缺失与普通角色过度授权修复。无依赖变动，pnpm lockfile 无项目版本字段，无需重写。CHANGELOG 同步，KuVibe schema/revision/安装版本不变。

v2：deferred，依据用户明确仅规划；2.x 递增待实现与发布验收决策，不提前修改实际版本。本次初始化实现、验收、审查、文档和版本门禁完成，活动初始化计划合并至本笔记；v2 未进入开发，保留活动目录。未提交、打标签或发布。
