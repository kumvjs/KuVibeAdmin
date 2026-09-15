# 文档工作流

<!-- kuvibe: template=documentation-workflow revision=1 ownership=mixed -->

1. 加载 `.agents/project.md` 的项目语言约定；评估业务规则、工作流、数据模型、API/CLI、UI 集成、运维和架构影响，更新相关文档或记录 N/A 理由。
2. `docs/` 保存当前产品和架构事实，VitePress 仅负责展示；公共端点模型保存在 Swagger/OpenAPI，不生成空占位页。
3. 临时分析和计划放在 `.agents/notes/active/`；只有 active 允许笔记子目录。
4. 完成后更新当前文档，将有意义的历史合并到 `.agents/notes/implemented/YYYYMMDD-HHmm-TYPE-SLUG.md`，使用开发者本地时间并在正文记录 ISO 时间。包含问题、上下文、决策、替代方案、约束、实现、验证、文档影响、后果、后续事项及版本影响；简单排版修正可记录笔记 N/A。
5. 仅清理已完成的 active 范围；正常维护或协议刷新不得重写历史笔记、批量翻译既有文档或重新生成项目知识。
