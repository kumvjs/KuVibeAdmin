# Atlas 迁移安全接入与 UTC 原地转换

日期：2026-09-17。变更集：atlas-migration-safety-20260917。

## 需求与决定

用户明确选择项目 Skill + Agent 工作流，普通终端 pnpm 不增加自动检查钩子；明确现有 timestamp 历史语义为 UTC。依据 Atlas 官方 Agent Skills 适配 TypeORM 项目，保持现有实体、迁移历史及部署工具。

新增 .agents/skills/atlas/SKILL.md 及 PostgreSQL、Atlas 验证参考，AGENTS.md 在 KuVibe 管理块外接入路由；快速开始补充调用边界和上线检查。Atlas SQL lint 不能直接读取 TypeORM .ts 文件；需完整基线及 SQL 验证副本。当前无 Atlas CLI，官方自 v0.38 起 lint 需要 Pro，已明确未执行。

## 迁移修正

用户此前执行 1789648814246 失败并 ROLLBACK；本次修正该未成功应用的候选文件，不修改已应用历史。13 表 40 列由 DROP/ADD 改为 ALTER TYPE ... USING ... AT TIME ZONE 'UTC'；down 反向转换。保留已有默认值、注释、约束和索引，不再按生成器结果重建附件索引或意外改变索引顺序。

## 验证

- 使用已有 postgres:17.11 镜像创建本次专用隔离容器/空库，重放两个实际建表迁移。
- 带数据集成测试在 America/New_York 会话中执行 up/down/up：40 列类型、历史时间点、微秒、NULL、软删除、有效/过期令牌、附件过期时间、约束、注释、索引和默认值通过；升级后 TypeORM 只读实体 diff 为空。
- 本地已安装 Nest CLI 构建通过；变更文件 ESLint 修正后通过；git diff --check 通过。
- Skill 官方 Python 校验器缺少 PyYAML，改用已安装 js-yaml 验证 frontmatter，并校验引用文件存在，人工审查触发条件、能力边界及处置流程。
- pnpm 启动因指定版本下载/签名验证失败，未绕过其验证；构建使用 core/node_modules/.bin/nest，测试使用 node --test。
- 未执行用户日常或生产数据库迁移；未运行 Atlas lint、生产规模压测或新旧应用滚动发布演练。小样本通过不等于零停机；排他锁仍需维护窗口、超时预算及备份/恢复演练，无法接受窗口时改为分阶段迁移。

## 版本与保留项

patch / bumped：根 package.json 与 packages/backend/package.json 1.1.0 → 1.1.1，修复迁移安全工作流和未执行迁移的数据丢失风险；CHANGELOG 已同步。锁文件不包含本地应用版本，依赖未变化，无需改锁。KuVibe schema/revision 不变。

保留用户新增 migration:check 脚本、原有发布 active 目录与 Vben 计划，不扩大为正式发布。当前安装的 TypeORM CLI 未找到 migration:check 命令；该用户脚本未作为本次安全验证依据。
