# 系统附件

`UploadModule` 是生产可用的系统模块，不依赖 Playground。它提供策略管理、单文件上传、附件分页/详情/删除、鉴权下载、头像绑定和后台清理。请求字段、权限和返回结构以 Swagger 的“上传策略”“系统附件”为准；JSON 继续使用 `ResOp`，文件下载返回二进制流。

## 初始化与部署

由部署方按实体创建 `sys_upload_policy`、`sys_attachment`、`sys_attachment_reference`、`sys_attachment_audit` 四张新表。本功能不提供迁移，不自动建业务表，也不转换或删除旧 `public/uploads` 文件。旧临时上传路由和清理器已移除，旧上传静态目录不再开放。

本地文件落在应用工作目录的 `var/attachments`，应挂载持久卷并限制为应用账号访问，不能挂到 Web 服务器公开目录，也不能通过符号链接指向其他位置。数据库保存随机对象 key，原始名称只作为展示/下载名称。多实例必须共享该持久卷；对象存储、分片续传和文档预览不属于本期实现。

没有隐式运行时策略。管理员先通过策略写接口创建用途，例如 `attachment` 和 `avatar`。通用附件建议私有；示例策略业务数据如下（所有字段定义见 Swagger）：

```json
{
  "enabled": true,
  "allowedFormats": ["jpg", "png", "webp", "pdf", "docx", "xlsx", "txt"],
  "maxFileBytes": 10485760,
  "maxTotalBytes": 10485760,
  "maxFiles": 1,
  "visibility": "private",
  "retentionSeconds": 86400,
  "maxImageWidth": 2048,
  "maxImageHeight": 2048
}
```

格式、大小、数量、图片宽高、启停、可见性和未绑定保留期从数据库管理，不使用环境变量覆盖。单文件接口始终只收一个 `file`，数量策略不会把 Vben 的单对象响应变成数组。用途通过 query 传入，不接受额外 multipart 字段。缺失策略返回 404，禁用返回 403，无效策略无法读取时返回 503。

资源安全上限为单文件/请求文件内容总量 1 GiB、数量 20、未绑定保留期 30 天；图片最大 4096×4096，未配置宽高时使用此上限。上传流最长处理 120 秒，图片解码/归档检查另有时限。反向代理请求大小应覆盖所配文件上限和 multipart 开销，并配置上传/下载频率、并发及容量告警；应用不承诺单机可以承受无限并发的最大文件请求。

## 缓存一致性

策略命中 Redis 不查策略表，缓存最长 60 秒，包含用途、数据库 revision、缓存结构版本和随机 generation；负缓存也有 TTL。同进程同用途请求合并，Lua 条件回填防止变更前的慢查询写回旧策略。缓存 key 使用用途 hash tag，支持 Redis Cluster 的同槽操作。

数据库提交后重试三次失效。失效最终失败会告警并返回明确“已保存”的 503，管理员可以重试保存；旧快照最多保留 60 秒。Redis 读取失败按每进程每秒一次限流回源，回填失败有短暂熔断。没有有效策略就拒绝操作，不回退成无限制上传。直接改表不会触发主动失效；数据库与 Redis 之间不宣称强原子一致。

## 内容校验与扫描边界

支持 JPEG/PNG/WebP/非动画 GIF、PDF、UTF-8 TXT/CSV、DOCX/XLSX/PPTX、ZIP、MP3/MP4。格式白名单同时核对文件后缀、声明 MIME 和内容；通用 `application/octet-stream` 仍需通过实际内容检测。旧版 DOC/XLS/PPT、宏文档、可执行文件、HTML/SVG 不在白名单中。

图片使用有像素/尺寸/时间限制的解码与重新编码，去除元数据及尾随内容；Office 检查 ZIP 容器、主文档及内容类型，拒绝宏标识、加密项、路径穿越和异常膨胀比；ZIP 不自动解压到磁盘；文本流验证 UTF-8 与控制字符。音视频/PDF 采用格式识别而非完整业务解析，格式通过不等于文件绝对安全。相关组件依据：[file-type](https://github.com/sindresorhus/file-type)、[sharp](https://sharp.pixelplumbing.com/api-constructor/)、[OWASP 上传建议](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)。

`AttachmentScanner` 提供可替换的扫描入口。默认不接入外部杀毒引擎，记录始终为 `unscanned`，不会伪报 `clean`；扫描返回 `rejected` 会终止上传并补偿删除。生产启用业务文档或压缩包前，应按组织安全要求接入扫描/隔离服务。默认不提供通用文件在线预览。

## 私有下载与公开头像

私有附件没有匿名永久下载地址。无引用文件限上传者访问；绑定后由服务器注册的业务处理器判断权限，上传者身份不能绕过业务授权，未知业务类型默认拒绝。管理员通过独立附件读取权限进行审计访问。私有文件不进入静态目录，下载强制 `attachment`、`nosniff` 和禁止缓存，文件名安全编码。

公开只允许明确配置为公开的 `avatar` 图片策略，而且必须绑定到当前有效用户的头像字段后才开放。仅上传成功不会自动公开；停用/删除用户、替换头像后，旧公开地址停止提供内容。公开内容一旦被下载，后续撤销不能收回客户端已保存的副本。

头像流程：上传 `purpose=avatar` → 取得字符串附件 ID → 调用头像绑定接口。用户资料仍保存/返回 `avatar` URL，不改变现有响应字段。私有头像/附件地址需通过携带 Bearer Token 的请求取得 Blob，不能直接当作匿名 `<img src>`，也不能把 Access Token 放到 URL。通用上传结果仍有 `url`，但它可能是鉴权下载地址，前端需区分可见性。

旧用户管理接口仍可写外部头像 URL；改写或删除用户时在同一事务解除旧附件引用。不能通过直接写系统下载 URL 绕过附件绑定。

## 业务引用、删除与审计

业务模块在服务器注册 `AttachmentBusinessRegistry` 处理器，提供用途、绑定/读取权限及可选公开检查。业务事务内调用 `bind` / `unbind`，验证业务身份、附件归属、用途、状态和有效期；没有可由客户端任意提交业务类型/ID 的通用绑定接口。

上传先记录 `pending`，流式落盘、校验、扫描入口及元数据提交全部成功后才变为 `ready`。异常请求补偿删除；进程中断留下的 pending 记录在 15 分钟租期后回收。文件和数据库不是同一事务，不能把“写磁盘成功”当作完整上传成功。

绑定、清理与删除共用附件行锁。后台每分钟分批检查最多 100 条到期或待删除记录，重新确认状态、到期时间和引用，使用 `SKIP LOCKED` 避让其他实例。已绑定文件不因年龄被删除；解除最后一个引用后可回收。

删除先标记 `deleting` 停止访问，文件删除失败保留错误状态等待重试；成功后标记 `deleted`，记录仍可在管理端查询。上传、绑定、解绑、删除请求和下载授权写入附件审计表；“下载授权”并不声称客户端已完整收到所有字节。旧临时文件不会被新清理器扫描。

## 验证

运行单元测试后，可对独立的本机 PostgreSQL/Redis 执行 `pnpm test:upload:integration`，需提供 `UPLOAD_TEST_DATABASE_URL`（数据库名限定为 `m71_test`）和 `UPLOAD_TEST_REDIS_URL`。测试创建并清理自己的随机 schema/Redis 前缀及临时文件，不使用现有业务库。集成测试使用真实 PostgreSQL、Redis、Fastify、JWT 签名验证和 RBAC；完整登录/Passport 会话及浏览器 Vben 联调仍属于跨模块 M8 验证。
