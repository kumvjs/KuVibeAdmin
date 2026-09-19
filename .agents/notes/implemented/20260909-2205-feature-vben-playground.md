# Vben 非生产 Playground 接口 — Batch M7

Timestamp: `2026-09-09T22:05:22+08:00`

## Problem and context

锁定的 Vben v5.7.0 playground 声明 `/table/list`、`/upload`、`/demo/bigint` 和 `/status` 四个本地演示接口。项目已有 Fastify multipart 与静态资源能力，但没有真实上传策略；上游 mock 使用随机 faker 数据、固定外链上传结果、原始超长整数 JSON 和任意状态码，同时还有两个未被前端调用的 `/test` 诊断路由。

## Decision

- M7 作为独立 Playground 模块实现，并只在非 production 环境注册；用户本次明确从 M5 跳到 M7，M6 保持待办。
- 复用现有 Fastify multipart 和 `public` 静态目录，实现单机临时图片存储，不引入对象存储 SDK、数据库表或资产领域。
- 上传仅接受一个经过认证的 `file` 字段、最多 6 MiB，并要求 JPEG/PNG/WebP MIME 与魔数一致；忽略原文件名，使用 UUID 对象名。
- 上传 URL 位于 API origin 的 `/uploads/...`，文件保留 24 小时并在模块启动和后续上传时清理；production 同时拒绝该静态路径，防止误复用目录时泄漏。
- 表格使用固定 100 条内存 fixture、白名单排序和 `{ items,total }` 分页，不复制 faker 随机性，也不创建虚构产品表。
- bigint 接口显式绕过普通对象 JSON 序列化，发送锁定的超长数字字面量；status 接口显式返回标准错误信封和请求的 HTTP 状态，缺省 200 兼容参数序列化页面。
- 不实现 mock-only GET/POST `/test`。

## Alternatives

- 生产对象存储被排除：项目没有 S3/OSS/provider、恶意文件扫描、资产所有权或删除业务需求，擅自选择会形成新的生产架构边界。
- 生产本地磁盘上传被排除：多副本一致性、持久卷、备份、扫描和生命周期均未定义。
- 把演示表格和上传元数据落库被排除：它们不是产品领域，活动约束明确禁止为 demo 创建假业务表。
- 把 bigint 转成字符串 DTO 被排除：这个端点的唯一用途就是测试 Vben 对超出安全整数范围的 JSON 数字字面量解析；普通业务 API 仍应返回字符串 ID。
- 暴露上游 `/test` 被排除：它们没有前端调用契约，只是 mock 诊断路由。

## Implementation

- 新增 `PlaygroundModule`、控制器、表格服务、上传服务、Swagger DTO、固定 fixture 和行为/契约测试。
- `AppModule` 通过环境判断条件注册模块；环境校验增加明确的 `test` 值。
- multipart 文件流在 parts 迭代期间消费，避免未读取流阻塞；限制错误映射为 HTTP 413，字段错误映射为 HTTP 422，内容类型错误映射为 HTTP 415。
- 本地文件写入使用 `wx`、`0640`、UTC 年/月目录和 UUID 扩展名；路径解析保持在固定 upload root 内。
- `public/uploads/.gitignore` 保留静态根目录但排除运行时文件。
- Fastify onRequest hook 在 production 对 `/uploads` 和其子路径返回 404。
- 文档和活动 requirement/analysis/acceptance/plan 同步记录环境边界、响应例外和上传生命周期。

## Verification

- Playground focused Jest: 4 suites / 15 tests passed。
- Core full Jest: 35 suites / 195 tests passed（通过 `NODE_OPTIONS=--experimental-vm-modules` 执行）。
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed。
- M7 changed-file ESLint passed。
- Nest build passed。
- Vben contract parser tests: 3/3 passed。
- Locked v5.7.0 contract check passed；same-tag diff reports `Changes: none`。
- `git diff --check` passed；未新增迁移。
- 当前 workspace 未安装 VitePress 可执行文件，因此未执行文档站构建。
- 未启动真实 HTTP 服务做 multipart/static 端到端请求；控制器、文件流、磁盘写入、类型识别、清理、环境开关和响应边界由单元/契约测试覆盖，完整 e2e 仍属于 M8。

## Documentation impact

更新 API、Vben 对接和项目概览，明确四个演示接口、认证差异、非生产注册、原始 bigint 响应、临时公开上传约束以及 mock-only 路由排除。

## Consequences and follow-ups

Vben v5.7.0 的四个 Playground 调用在 local/development/test 环境可用，production 不暴露演示控制器或上传文件。临时上传没有病毒扫描、资产所有权、删除 API 或跨实例一致性；若以后需要生产上传，必须单独设计对象存储、访问控制、扫描、元数据、清理、回滚与迁移。M6 时区偏好仍未实现，M8 仍需真实 HTTP、PostgreSQL、Redis 和 Vben e2e 验证。
