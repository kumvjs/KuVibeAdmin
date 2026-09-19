# Vben 菜单模型重建

## 范围

完成计划 M2.1–M2.2。本批只重建菜单类型、Swagger 契约、实体和原有权限码查询，不发布 `GET /menu/all`、`/system/menu/*` 或菜单写业务。

## 设计结论

菜单表会重新创建，不迁移旧数据，因此没有必要保留旧数字三类型领域模型，也不需要 `vben-menu.adapter.ts` 做双模型转换。实体和共享类型直接采用 Vben v5.7.0 语义，独立 DTO 只负责 Swagger 与输入校验。实际删表、建表和数据重置不由本代码批次自动执行。

## 实现

- 用 `catalog | menu | embedded | link | button` 五类型和 `0 | 1` 状态建立共享菜单类型。
- 保留 Vben 写入、系统列表和动态路由 Swagger DTO；兼容表单顶层 `activePath`、`linkSrc`，后续写服务负责归入 `meta`。
- `SysMenuEntity` 仅保留 `pid`、`name`、`path`、`authCode`、`type`、`component`、`redirect`、JSONB `meta`、`status` 以及必要关系。
- 增加五类型与状态检查、bigint 父子自关联、父删除限制，以及 name/path/authCode 唯一索引。
- 删除此前未提交的迁移和 Vben adapter；不提供旧字段、逗号权限码或旧数据兼容层。
- 保留 `MenuService` 权限逻辑并适配 numeric 状态和单值 `authCode`，角色联表结果使用 SQL distinct 后再去空、去重、排序。
- 文档明确新表需要重新初始化、当前菜单接口仍未开放。

## 验证

- 菜单范围 Jest：3 suites / 12 tests passed。
- Core 全量 Jest：12 suites / 45 tests passed。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- 菜单范围 ESLint passed。
- Nest build passed。
- Vben contract parser：3 tests passed。
- 锁定的 Vben v5.7.0 snapshot 与 fixtures 校验 passed。
- `git diff --check` passed。
