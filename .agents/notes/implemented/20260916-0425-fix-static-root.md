# 固定静态资源目录

public 固定为应用根目录下与 dist 同级的目录，支持 src、dist、dist/src 三种入口布局，不再按目录存在性或 cwd 回退。首次启动自动创建，无需配置；保留 FastifyStatic 直接注册及 uploads 访问限制。输出布局取决于编译配置，当前 rootDir ./ 对应 dist/src。

已有附件模块仍按需创建 var/attachments；本次未变更其基于 cwd 的定位，不移动历史文件。public 仅放公开资源。已更新快速开始文档，Vben 进行中的里程碑不变。

验证：Nest CLI build、ESLint、git diff --check 通过。Node 原生测试配合真实 Fastify inject 验证三种布局、自动创建、dist/public 不抢占、删除 dist 保留资源、启动后新增文件访问及 uploads 404。未启动完整数据库应用。

版本：变更集 static-root-20260916，语义 patch，有效递增 deferred（项目开发期延后发布）。根与 core package.json 实际基线/目标均为 1.0.0；项目上下文仍记录 core 0.0.1，本次不据此覆盖清单。KuVibe 0.3.2/schema 2、模板 revision 不变，无 CHANGELOG 发布记录。需求、实现、验收、审查、文档与版本影响检查完成。
