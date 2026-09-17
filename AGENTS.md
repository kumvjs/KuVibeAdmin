<!-- kuvibe:managed:start template=agents-router revision=1 -->
# Agent 路由

开始非简单任务前：

1. 阅读 `kuVibe.md` 和 `.agents/kuvibe.yaml`，先判断版本状态；状态无效或 schema/release 不受支持时停止版本写入。
2. 阅读 `.agents/project.md` 和 `.agents/context/stack.md`，加载项目语言、版本约定及工程约束。
3. 从 `.agents/workflows/` 选择相关工作流；需求完成时执行版本影响与完成检查。
4. 对于有进行中范围的任务，阅读 `.agents/notes/active/` 下对应目录并维护其产物。
5. 保留项目文档和用户现有改动；使用 Git 历史恢复，刷新或迁移不得重新生成项目知识。

当前进行中的业务工作：`.agents/notes/active/vben-api-compatibility/`。
<!-- kuvibe:managed:end -->

## 数据库迁移

执行 `pnpm migration:generate`、审查已有迁移、处理迁移失败或准备数据库上线时，读取并使用 [Atlas 项目 Skill](.agents/skills/atlas/SKILL.md)。生成后继续完成数据保留修正、隔离库验证和部署影响审查；生成成功不能直接视为可上线。普通终端 pnpm 不会自动运行该 Skill。

团队提示词和交付标准统一维护在 [快速开始：团队统一使用方式](docs/guide/getting-started.md#团队统一使用方式)，后续使用说明引用该入口。
