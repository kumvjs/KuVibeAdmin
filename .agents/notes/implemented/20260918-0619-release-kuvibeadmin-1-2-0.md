# KuVibeAdmin 1.2.0 正式版与 M8 验收

时间：2026-09-18T06:19:35+08:00
变更集：kuvibeadmin-backend-release-20260917。

## 需求与范围

用户授权完成本项目现有计划、更名仓库为 kumvjs/KuVibeAdmin、建立 README（介绍基于 KuVibe）并发布正式版；随后明确本次仅发布后端，并追加根目录 start:local 等常用命令。AI Agents 业务路线不纳入本次；Vben 源码只检出到临时目录作验收，不进入交付应用。

中断期间用户另行完成 Atlas Skill 与 UTC 时间戳迁移，独立提交 4371122 已将版本升为 1.1.1。本次保留其迁移和用户删除无效 migration:check 脚本的改动，不重复执行日常数据库迁移。

## 现有计划完成结论

- M0：固定 Vben v5.7.0 / 63a38dce49ba109f61607994e21ba921d8e970e9，31 个前端调用契约及 main 预警已存在；本次重跑原始上游快照和 fixture 校验。
- M1：真实 Passport 登录、JWT、Refresh Cookie 轮换、重放拒绝、退出与会话撤销通过生产模式完整应用验收。
- M2–M5：菜单/按钮、部门、角色、用户及角色授权保持同一 RBAC 模型；M8 补充真实 PostgreSQL 约束/回滚、HTTP CRUD、并发部门唯一性、树循环、软删除、bigint 字符串边界和 Redis 权限失效。
- M6：用户时区与显式业务时间工具已完成；复验独立 PostgreSQL 持久化和跨进程时区。
- M7 / M7.1：演示接口保持非生产边界；生产附件模块 19 项真实 PostgreSQL/Redis/Fastify 验证再次通过。
- M8：完整后端和固定前端浏览器验收通过，Swagger 与实际 POST 状态码一致，全部迁移 up/down/up 与实体零差异，时间戳带数据往返验证通过。
- 上游基线升级条目为条件性要求，本次未升级；此前没有第二个已发布支持基线，因此“两个基线都通过”不适用。后续升级继续使用现有锁、差异工具和 PR 模板。

原 active 的 requirement / analysis / acceptance / plan / attachment-design 已合并为本记录和当前 docs；逐批实现证据保留在已有 implemented 笔记。完整原始产物可从 Git 提交 4371122 恢复，不改写历史记录。

## 实现及审查发现

1. 品牌、根/core 私有包名、仓库元数据、README、文档站统一为 KuVibeAdmin；保留数据库名、schema、Redis 键与 HTTP 前缀。
2. 根目录启动、构建、初始化、测试、类型、lint、迁移、文档命令代理到实际包；生产入口修正为 dist/src/main.js，使用 production 环境；Jest 入口支持 ESM。
3. 完整 HTTP 验证发现 DTO 的可选字段会初始化为 undefined，自有属性检查将缺省字段误判为用户提交。hasSubmittedField 同时判断值，部门/菜单/角色/用户写规则及角色和密码更新共用；显式 null 仍保留业务清空或拒绝语义。
4. ApiResult 支持实际成功状态和可空数据；认证及创建 POST 的 201、上传/时区的 200 与 OpenAPI 一致，不改变实际 HTTP 契约。
5. 新增可重复的 release.integration.mjs 与 Vben 临时适配/浏览器脚本；不增加生产运行时依赖。
6. 软删除用户仍保留部门外键，删除部门继续拒绝所有引用；浏览器验收先转移用户部门再删除，不放松约束来迎合测试。

## 附件设计的持久边界

沿用独立 UploadModule、本地持久卷、公开根目录之外的随机对象 key、默认私有及显式公开图片。策略源为 PostgreSQL，Redis generation/Lua 条件回填、有限 TTL 和故障限流保持不变；默认 scanner 返回 unscanned，不宣称已经杀毒。引用绑定由可信业务服务在业务事务中执行；pending/ready/deleting 生命周期、补偿与引用感知清理已有测试。正式版已提供四表迁移，策略初始化、持久卷、容量限制和病毒扫描仍由部署方配置。当前事实见 docs/modules/attachments.md。

## 验证结果

- 根 pnpm test --runInBand：43 套件、283 测试通过。
- 根 pnpm test:release：12 组检查通过，真实生产模式应用、Passport、专用 PostgreSQL 17.11 / Redis 8.2.9，涵盖四份迁移完整往返、实际约束和事务回滚、全部管理域与权限变更。
- 时间戳迁移：1 组带数据 up/down/up；时区：3 项；数据库配置：2 项；静态入口：1 项；附件 production 集成：19 组通过。
- Vben Playwright Chromium：真实表单登录、后端动态路由、401 自动刷新、四域前端 API CRUD、角色/用户/菜单列表页、普通用户按钮隐藏、后端 403、退出再登录通过。用户 CRUD 使用前端 API 调用器提交 username/password/roleIds，不宣称未经适配的上游用户表单开箱即用。
- 固定上游契约工具 3 项及网络克隆的原始快照/fixture 验证通过；经适配临时检出不用于原始快照检查。
- 根 start:local/start:dev/start:prod 实际启动并通过 HTTP 检查。
- TypeScript、Nest 构建、VitePress 构建、冻结锁安装、改动源码 ESLint、脚本语法与 git diff --check 通过。

## 验证边界与部署

全量 ESLint 有既存 300 项错误（包括历史生成迁移格式和旧源码规则），不将其写为通过，也不重写已应用迁移；本次变更源码全部通过。Atlas CLI 未安装，未运行 Pro lint；小样本测试不能证明生产规模锁预算或零停机。按 Atlas Skill 完成 PostgreSQL 替代验证，部署前仍需备份、维护窗口和目标规模演练。时间戳历史 UTC 语义已由用户确认，但不自动适用于其他部署。

前端不随版本发布，用户表单及日期筛选接入约束继续保留在 docs/frontend/vben.md。AI Agents 业务、对象存储驱动和部署侧扫描器属于后续独立范围。

## 文档与版本决定

当前事实同步 README、快速开始、概览、Vben 接入、认证/数据/附件和发布验收文档。团队提示词唯一入口仍为 docs/guide/getting-started.md#团队统一使用方式。

minor / bumped：根 package.json 与 packages/core/package.json 均 1.1.1 → 1.2.0，最高影响来自新增根目录工程命令和发布验收入口，其余为兼容修复。中断前原候选 1.1.1 未应用，本次不覆盖已完成 Atlas 需求；CHANGELOG 保留其独立条目。锁文件不记录本地应用版本、依赖未变化，冻结安装验证通过。KuVibe 0.3.3 / schema 2 / 模板 revision 不变。

用户已授权 GitHub 更名、提交、标签与正式发布。正式标签为 v1.2.0，发布入口：https://github.com/kumvjs/KuVibeAdmin/releases/tag/v1.2.0 。GitHub Release 发布源码，不执行 npm publish 或用户生产数据库迁移；发布状态以远程标签和 Release 为准。
