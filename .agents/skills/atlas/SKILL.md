---
name: atlas
description: 审查和修正本项目 TypeORM/PostgreSQL 迁移，结合 Atlas 做 SQL 检查与隔离数据库验证。在执行 pnpm migration:generate、处理迁移失败或准备数据库上线时使用。
---

# Atlas 迁移安全工作流

按 [Atlas Agent Skills](https://atlasgo.io/guides/ai-tools/agent-skills) 的生成、检查、验证流程适配本项目。先读取根目录 atlas.hcl（如存在）、packages/core/package.json、数据库配置及待处理迁移。TypeORM 继续管理实体、TypeScript 迁移和执行历史；此 Skill 不会在普通终端运行 pnpm 时自动执行。

## 生成后的处理

1. 检查 Git 差异、实际数据库/schema、历史迁移和实体，不打印凭据。生成/检查前确保 synchronize=false、migrationsRun=false，避免比较时顺带修改数据库。当前脚本固定 NODE_ENV=local，不是生产入口。
2. 从 packages/core 执行 pnpm migration:generate，或直接审查用户已经生成的文件。无差异可返回 1；区分无变化和真正失败，不重复生成。生成成功只是候选 SQL。
3. 逐条审查 up 和 down。只修正未应用的迁移，通过历史记录或本次失败回滚证据确认状态，不能从 Git 是否跟踪推断；已应用文件保留并新增纠正迁移。
4. 按 [PostgreSQL 审查与验证](references/postgres.md) 处理数据保留、类型转换、约束、索引、锁和滚动发布兼容性。无法确定旧数据含义时完成独立工作并明确阻塞项，不猜测转换规则。
5. Atlas 可用时按 [Atlas 检查接入](references/atlas-validation.md) 检查；不可用时记录原因，继续审查及隔离 PostgreSQL 验证，不能将未运行的 lint 写为通过。
6. 在隔离数据库重放已应用基线、插入代表性旧数据，再执行候选迁移；验证数据和目标结构，以及可行的回滚或前向恢复。编译通过或空库成功不能替代已有数据验证。
7. 交付具体文件、修正原因、历史语义证据、验证结果、锁/重写影响、发布顺序和恢复方案。证据不足时不得标记可上线。生成/修正授权不等于生产执行授权，沿用会话已有部署授权。

不要用任意默认值、清空数据或删除历史记录绕过失败。不将无损转换等同于无锁上线；大表按锁预算选择维护窗口或分阶段迁移。不自动执行生产 migration:run、Atlas apply 或开启 synchronize。
