# 修复静态插件注册导致 HTTP 启动挂起

时间：2026-09-16T01:44:44+08:00

## 问题与证据

`start:local` 停在 `Nest application successfully started`，没有最终服务地址且 7001 未监听。完整应用成功连接 PostgreSQL/Redis 后可复现。最小 Nest 应用分别测试 helmet、CORS 均能监听；调用 `useStaticAssets` 则超时且 server.address() 为 null，即使 await 该调用也不能解决。

本地安装的 Nest 12.0.1 FastifyAdapter.useStaticAssets 使用动态 import，经 loadPackage 原样返回模块命名空间，再交给 register。显式使用 @fastify/static 默认导出的插件函数后，同样的最小程序可以监听。

## 实现与范围

- main.ts 显式导入并注册 @fastify/static，保留现有静态目录选择和 uploads 访问限制。
- 清理此次启动路径已有的临时 BOOT 步骤日志，保留启动异常报告、最终地址与 Swagger 日志。
- 更正把挂起归因于 listen 回调的注释；Nest 初始化完成不等于 HTTP 已监听。
- 更新快速开始文档中的启动验收依据。无需变更 API、数据模型、迁移、权限或业务工作流；现有 Vben 未完成里程碑保持不变。

## 验证与审查

- 已安装 Nest CLI build 成功；main.ts ESLint 通过。
- 修复前最小复现超时，修复后相同静态插件默认导入的实际监听成功。
- 完整应用连接本机 PostgreSQL/Redis，正常输出 Server running on http://127.0.0.1:7001。
- NODE_ENV=local 下已安装 Nest CLI start --watch 编译、启动和改动后重启均成功；localhost:7001/api/status 与 /api-docs 返回 200，/uploads/test.png 返回 404。
- pnpm start:local 在本执行环境受到 pnpm 11.25.0 自动版本切换下载/签名验证失败阻断，因此直接运行已安装 CLI 验证脚本对应流程，未修改包管理器或锁文件。
- 采用实际监听与 HTTP 冒烟验证，未增加模拟监听实现的单元测试；未执行数据库迁移或业务数据修改。诊断进程在验收后关闭。

## 版本影响与完成检查

变更集：static-startup-20260916。语义影响 patch（兼容启动修复）。产品版本来源及基线：根 package.json 1.0.0、packages/core/package.json 0.0.1；目标保持原值，有效递增 deferred，遵循项目既有开发期延后发布约定。无既有 CHANGELOG，未新增发布记录；KuVibe schema 2、release 0.3.2 及模板 revision 不变。需求、构建、实际 HTTP 验收、差异审查、文档影响和版本一致性检查完成。
