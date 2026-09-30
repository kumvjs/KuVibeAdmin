# Playground OpenAPI 生成客户端

时间：2026-09-25T00:27:11+08:00。变更集：openapi-playground。

## 问题与决策

后端 Swagger 只有 HTTP JSON，Playground 尚无项目业务 SDK；Vben 原有 `src/api` 及 `baseRequestClient` 需保留。选择在 SWAGGER_ENABLE=true 时从同一个 Swagger document 导出忽略提交的本地 JSON，前端 OpenAPI-TS 从该文件生成。关闭时不注册 Swagger、不生成文件，旧快照保留并在文档要求重新启动确认。前端 SDK 使用独立 Axios 客户端与 `apiRequest` 解包，以便业务渐进接入；不改 Vben 原有认证流程。

生成文件按 JSON 的 tag 自动推导纯 ASCII 文件名；纯中文 tag 使用该组 operationId 的公共前缀，仍无法推导时使用稳定哈希，文件名冲突时再附加稳定哈希；请求函数与接口类型按组分文件，公共 DTO 独立模型文件。`operationId` 全局重复在生成前报错。固定 tag 映射、手写客户端或复用 Vben 拦截器均未采用，分别会增加维护、类型漂移或影响原有客户端。站点名称使用用户确认的 KuVibeAdmin。

## 实现与验证

后端修正登录 User-Agent 可选声明与统一响应 data 必填声明，使生成类型符合实际响应。测试覆盖导出开关、磁盘与 HTTP JSON 一致、保留旧快照；隔离测试从真实控制器与 DTO 元数据生成客户端契约。前端单元测试覆盖 Cookie、Bearer、locale、解包、业务错误和 HTTP 错误；Playground 类型检查、生产构建及文档构建通过。完整后端启动联调未执行：本机 PostgreSQL 与 Redis 未启动；隔离契约不替代运行中的真实文档。

验收：`src/api` 无改动，原有 `baseRequestClient` 无改动。部署方需在服务配置 `SWAGGER_ENABLE=true` 后启动服务生成 JSON，再执行 Playground 的 `openapi-ts`；生产访问地址由 `VITE_KUVIBE_API_URL` 或同源 `/api` 决定。修改只影响可选生成流程，回滚时可移除 `src/services` 并恢复 Swagger 导出代码，现有 Vben API 不依赖它。

## 文档与版本

更新 `docs/frontend/vben.md`、`.agents/project.md` 与 CHANGELOG。语义/有效影响：minor，新增兼容的 OpenAPI 生成能力；根 `package.json` 与 `packages/backend/package.json` 统一 1.2.2 → 1.3.0。`packages/frontend/playground/package.json` 保留 Vben 上游 5.8.0 版本，不随产品版本递增；`docs/package.json` 无版本。KuVibe 0.3.3/schema 2 状态不变，未改变协议结构或模板 revision。未提交、打标签或发布。
