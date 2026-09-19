# Vben 系统菜单管理树

## 范围

完成计划 M2.4：发布只读 `GET /system/menu/list`。本批不实现名称/路径检查、菜单 CRUD 或权限缓存失效写钩子。

## 实现

- 新增独立 `SystemMenuController`，避免把运行时 `/menu/all` 与 `/system/menu/*` 路径混淆。
- 接口声明 Swagger `ResOp<VbenMenuResponseDto[]>`，并要求 `system:menu:list` 权限；`super` 由现有全局 RBAC 规则放行。
- 查询所有未软删除菜单，包含五种类型、按钮以及 `status=0` 的停用记录。
- 显式投影 Vben 字段，不暴露审计字段、父实体或角色菜单关系。
- Bigint `id`/`pid` 保持字符串，保留 JSONB `meta` 和可选 `authCode`、`path`、`component`、`redirect`。
- 为 v5.7.0 编辑表单额外输出顶层 `activePath`，其唯一持久化位置仍为 `meta.activePath`。
- 每层按 `meta.order`、唯一 `name` 排序；缺失/自指父关系归一为根，循环关系确定性断开一条边，保证每条记录只出现一次且响应可序列化。

## 验证

- 菜单范围 Jest：5 suites / 20 tests passed。
- Core 全量 Jest：14 suites / 53 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 菜单范围 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 锁定的 Vben v5.7.0 snapshot 与 fixtures 校验 passed。
- `git diff --check` passed。
