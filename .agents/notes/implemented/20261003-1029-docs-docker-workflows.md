# Docker 启动、更新与部署文档整理

时间：2026-10-03T10:29:20+08:00
变更集：20261003-docker-guide-workflows。

## 问题与范围

用户要求明确前后端容器更新及数据库迁移命令，并按快速本地启动、修改生效方式和生产部署整理 `docs/guide/docker.md`。原文将开发覆盖、后端编译产物、配置细节及升级混在一起，完整前后端启动需跳转其他文档。

KuVibe 0.3.3 / schema 2 为有效维护状态。工作树已有系统字典重构与产品 2.0.0 变更，本次保留其代码、迁移、历史笔记和 CHANGELOG 条目，不处理仍在 active 的账务上线范围。任务为文档维护，不执行数据库或容器升级。

## 决策与实现

- 先给出完整开发前后端的配置、构建、依赖、迁移、管理员初始化、启动顺序及访问地址；保留 `源码热更新开发环境` 锚点，兼容既有前端文档链接。
- 区分 `.env.docker.dev` / `kuvibe-admin-dev` 和根 `.env` / `kuvibe-admin`，强调独立数据卷及覆盖文件持续使用。
- 用修改类型表解释热更新、build + up、配置重建、迁移和基础数据初始化；给出后端、前端、两者更新及环境变量生效命令。
- 开发迁移查询先编译当前源码，生成时仅临时给迁移目录写权限；直接调用 TypeORM CLI 保留 development / production 环境，避免现有 pnpm 脚本强制 local。
- 明确现有业务前端只有开发容器。生产采用既有 Playground 构建，显式覆盖 API 地址并部署至 HTTPS Nginx；不新增生产 Compose 服务或修改 Vben 上游部署模板。
- 生产流程包括配置、首次迁移 / setup、静态发布、API 代理、停服备份、升级、验证和兼容性受限的回退。snapshot 与持久化细节移至末尾。
- Atlas Skill 仅用于核对迁移交付边界；继续引用 `docs/guide/getting-started.md#团队统一使用方式`，不复制团队交付标准或更改迁移实现。

## 验证与审查

- 核对 compose.yaml、三个开发覆盖文件、Dockerfile、开发包装脚本、前后端清单、数据库配置和 setup 代码，验证文档命令与实际服务一致。
- 使用临时非敏感验证变量执行普通、开发前后端、开发 snapshot 三套 `docker compose config --quiet`，均通过；未打印真实凭据。
- 18 个 Bash 代码块通过 `bash -n`，相对文档链接目标及既有前端锚点检查通过。
- `docs/node_modules/.bin/vitepress build docs` 通过；直接调用本地已安装工具，避免文档检查触发工作区自动依赖安装。
- `git diff --check` 通过。Docker up / build、真实迁移、Atlas lint、生产 Nginx 和备份恢复均未执行；文档验证不代表生产验收。
- 官方 Compose up / restart / run、Vite 环境变量和 Nginx proxy_pass 文档用于核对命令语义；实际项目行为以本仓库配置为依据。

## 文档影响与后续

仅修正文档中的 CLI / 运维流程；业务规则、数据模型、API、UI、架构和上游源码无实现变更。无需新增测试、迁移或部署配置。用户未要求运行升级、提交、打标签或发布，故不执行。

## 版本决定与完成检查

- 在写版本前记录：原始基线 2.0.0，目标 2.0.1；语义 / 有效影响 patch，原因是兼容的运维文档纠正。该决定属于独立文档需求，不重复计算字典需求的 major。
- 受影响权威来源：根 package.json 与 packages/backend/package.json，按既有固定统一版本同步；CHANGELOG 新增独立条目并保留用户现有内容。上下文仅同步当前版本快照。
- 锁文件未保存产品自身版本，也没有需要随本次版本同步的内部版本引用；Vben 上游包版本不变。
- KuVibe schema、模板 revision 和安装版本不变；无 harness 结构契约变更。
- 完成时核对两份清单和 CHANGELOG 均为 2.0.1，结果 bumped：根 / backend 2.0.0 → 2.0.1。重试沿用此基线与目标，不再次递增。
