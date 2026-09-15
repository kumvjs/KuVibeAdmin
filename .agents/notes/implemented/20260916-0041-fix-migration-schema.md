# 修复迁移重复生成全量表结构

## 范围与计划

- 需求：用户已执行 `InitData1780416958755`、`UpdateTable1789459958471`，再次生成迁移却包含已有表。
- Level 1：只读核对配置、数据库结构和迁移历史；修复 schema 与构建链路；修正未执行迁移；验证并更新文档。
- KuVibe 0.3.2 / schema 2 与状态文件一致，按维护处理。未更改协议版本或进行中的 Vben 里程碑。

## 原因及实现

- `.env.local` 的 `TYPEORM_SCHEMA=` 被直接传给 TypeORM。当前驱动使用 `schema ?? currentSchema`，空字符串不会回退，读取表结构时查询空 schema；建表 SQL 却未限定 schema，执行后表实际位于 `public`。
- 只读查询确认 9 张业务表位于 `public`，迁移历史与用户提供的两条记录一致。生成迁移比较实际数据库和实体，不以迁移历史作为结构快照。
- `database.config.ts` 将空值、纯空白归一化为 `undefined`，显式 schema 去除两端空白。
- 迁移 generate/run/show/revert 自动先构建；CLI 直接加载已编译的 ESM JavaScript，无需 CommonJS ts-node 包装器。
- 进一步发现 `sys_menu.meta` 的 SQL 函数默认值与驱动读取后移除类型转换的默认值不等，导致重复 ALTER；改为 JSON 对象默认值 `{}`，存储语义保持不变。
- 保留两份已执行迁移；将用户尚未执行的 `1789490156513-update-table.ts` 按实际差异重新生成，保留时间戳与类名，仅含 4 张附件相关表、索引、外键，共 14 条 up SQL。文件原本未被 Git 跟踪，完成后仍未暂存。
- 更新快速开始中的构建、迁移流程与 schema 排障说明。

## 验证与限制

- Nest 构建通过；Node 原生回归测试 2 项通过，覆盖缺省、空、空白、显式 schema 及 JSONB 默认值比较。
- 改动配置、实体和测试文件的 ESLint 通过。
- 真实 PostgreSQL 只读结构比较：排除尚未建表的 4 个附件实体后，9 张已有表的 up 差异为 0；完整实体的差异与修正迁移 up SQL 排序后完全一致。
- 数据库历史最终仍只有原来的两条记录。未运行迁移或回滚，未修改业务表和数据；down SQL 已审查但未在数据库执行。附件建表仍由部署方执行。
- `pnpm build` 因项目指定 pnpm 版本的注册表下载/签名验证失败而无法启动；使用已安装依赖的 Node 入口执行 Nest、TypeORM、测试和 ESLint 完成验证，未修改包管理器配置。

## 完成与版本影响

- 需求实现、回归、只读验收、差异审查及文档检查完成。
- 变更集 `fix-migration-schema-20260916`，语义影响 patch（兼容修复）。有效递增 deferred，遵循 `.agents/project.md` 开发期约定。
- 基线与目标均为根 `package.json` 1.0.0、`packages/core/package.json` 0.0.1；不改依赖，锁文件无需同步。无既有产品 CHANGELOG，不新增发布条目。
- KuVibe schema、模板 revision 和安装状态无变更。
