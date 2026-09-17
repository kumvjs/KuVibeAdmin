# 项目概览

Nest AI Boot 是一个以 NestJS 12 和 Fastify 为 HTTP 运行时的后端基础工程，目标是承载 AI Agents / 多 Agent 业务，并向 Vben Admin 风格的管理前端提供认证、用户、权限与实时通信能力。

当前仓库的重点是通用后端底座。AI 模块尚未进入业务开发阶段；系统管理的菜单、部门、角色和用户后端接口已经形成可用闭环。

## 技术栈

| 领域 | 实现 |
| --- | --- |
| Web 框架 | NestJS 12、Fastify 5、TypeScript ESM |
| 数据持久化 | PostgreSQL、TypeORM、软删除与审计字段 |
| 缓存 | Redis、ioredis、`@liaoliaots/nestjs-redis` |
| 认证授权 | Passport JWT、Access / Refresh Token、RBAC |
| 实时通信 | Socket.IO、NestJS WebSocket Gateway 基础设施 |
| 接口文档 | Swagger / OpenAPI；WebSocket Swagger 当前未启用 |
| AI SDK | OpenAI JavaScript SDK，当前仅有兼容接口客户端封装 |

## 实现状态

<table class="status-table">
  <thead><tr><th>能力</th><th>状态</th><th>说明</th></tr></thead>
  <tbody>
    <tr><td>应用启动与配置</td><td>可用</td><td>环境变量校验、Fastify 插件、全局前缀、CORS、静态资源与优雅关闭。</td></tr>
    <tr><td>认证</td><td>基本可用</td><td>登录、退出、Refresh Token 轮换、JWT 校验、令牌黑名单和密码版本检查。</td></tr>
    <tr><td>RBAC</td><td>管理闭环可用</td><td>用户—角色—菜单权限关系、权限装饰器和全局 Guard；菜单、角色和用户授权事务及定向缓存失效已实现。</td></tr>
    <tr><td>用户</td><td>可用</td><td>当前用户信息、Vben 分页、CRUD、角色分配、Argon2id 密码重置、强制下线和最后 super 保护。</td></tr>
    <tr><td>Redis 缓存</td><td>可用</td><td>统一序列化、空值缓存、TTL 抖动、分布式锁和前缀扫描删除。</td></tr>
    <tr><td>WebSocket</td><td>基础设施</td><td>基类、鉴权复用、会话与推送服务已存在，但没有具体 Gateway / 业务事件。</td></tr>
    <tr><td>AI Agents</td><td>规划中</td><td>没有对外 API、Agent 编排、工具系统、记忆或持久化实现。</td></tr>
    <tr><td>Vben 适配</td><td>系统管理与 Playground 后端完成</td><td>登录、用户信息、权限码、动态菜单、系统管理及非生产演示接口已对齐；M6 用户展示偏好与统一时间工具已提供，前端需接入“跟随设备”；用户表单需增加 username/password/roleIds。</td></tr>
  </tbody>
</table>

## 模块关系

```text
AppModule
├─ ConfigModule             环境变量与命名配置
├─ SharedModule
│  ├─ LoggerModule          AsyncLocalStorage trace 上下文
│  └─ CacheModule           Redis 缓存
├─ DatabaseModule           TypeORM / PostgreSQL
├─ AuthModule               登录、JWT、Refresh Token
├─ UserModule               当前用户与用户角色
├─ SystemModule             dept / user / role / menu / log
├─ UploadModule             系统附件、策略缓存、鉴权下载与业务引用
├─ PlaygroundModule         仅非生产环境的 table / bigint / status
├─ WebsocketModule          会话、Server 注册与推送基础设施
└─ AiModule                 当前为占位模块
```

## 关键约定

- 默认 HTTP 全局前缀为 `/api`，可由 `GLOBAL_PREFIX` 覆盖。
- 除 `@Public()` 接口外，所有 HTTP 路由默认经过 JWT 与 RBAC 全局 Guard。
- 成功与失败响应统一为 `code / data / message / success / traceId` 结构。
- 数据库主键在 TypeScript 中使用字符串承载 PostgreSQL `bigint`。
- AI 和 WebSocket 业务能力必须以“当前代码是否注册接口 / Gateway”为准，不能根据依赖包推断已完成。
