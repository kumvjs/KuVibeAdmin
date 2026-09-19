# Vben 动态菜单树

## 范围

完成计划 M2.3：发布 `GET /menu/all`，从现有 RBAC 关系生成 Vben 运行时动态路由。本批不实现 `/system/menu/*`、写业务或缓存失效挂钩。

## 实现

- 将 `MenuModule` 从 `/system` 路由挂载中移出并作为根功能模块引入，确保接口路径为 `/menu/all`。
- Controller 使用当前 JWT 用户并通过 Swagger 声明 `ResOp<VbenRouteRecordDto[]>`。
- 普通用户只读取启用角色关联的启用菜单；启用 `super` 角色读取全部启用菜单。
- 从直接授权菜单或按钮向上计算父链闭包，自动加入必要父路由。
- 按钮、无路径节点、禁用/缺失父节点、孤儿与循环分支不进入最终路由树。
- 路由只输出 `name`、`path`、可选 `component`/`redirect`、`meta` 和 `children`，递归按 `meta.order`、`name` 稳定排序。
- `sys_role_menu` 的两个外键改为 bigint，增加唯一关系与索引；角色删除级联清理，菜单删除受引用时由数据库拒绝。

## 验证

- 菜单范围 Jest：4 suites / 17 tests passed。
- Core 全量 Jest：13 suites / 50 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 变更范围 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 锁定的 Vben v5.7.0 snapshot 与 fixtures 校验 passed。
- `git diff --check` passed。
