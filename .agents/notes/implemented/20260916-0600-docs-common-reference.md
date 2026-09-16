# 补充内置公共能力文档

时间：2026-09-16T06:00:49+08:00
变更集：common-reference-20260916

## 问题与决策

用户需要了解 common 内置装饰器、Pipe 等能力。新增 docs/reference/common.md，覆盖公共能力目录并提供示例，接入侧栏、HTTP API 与请求链路页面。选择独立参考页，避免在链路页堆积开发细节；具体端点契约继续以 Swagger/OpenAPI 为准。

重点记录 CurrentUser 声明与运行时类型差异、SkipResponseTransform 方法级限制、分页结构差异、动态管道独立校验选项、bigint 校验范围及未启用的 WebSocket 文档设施。

## 范围与验证

仅改文档与导航，业务规则、数据模型、运行时 API、部署及 Vben 进行中里程碑不变。已对照 common、启动入口、认证 Guard 与登录类型审查内容。

本地命令 node docs/node_modules/vitepress/bin/vitepress.js build docs 通过编译、渲染及内部链接检查；git diff --check 通过。pnpm --dir docs build 等待无输出，改用已安装的 VitePress 入口完成等效构建。示例未独立编译或启动应用验证；无运行时代码变更，不新增行为测试。

## 版本与完成检查

语义 patch（补充已有能力文档），有效递增 deferred，沿用开发期延后发布约定。根与 core package.json 实际基线和目标均为 1.0.0；docs 无版本。上下文 core 0.0.1 是旧记录，不据此覆盖清单。KuVibe 0.3.2/schema 2 为维护状态；安装状态、schema、模板 revision、锁文件和 CHANGELOG 不变。

需求、文档、构建验收、源码审查、影响评估与版本检查完成。开发者可从导航查阅公共组件与限制；无本次范围待办。
