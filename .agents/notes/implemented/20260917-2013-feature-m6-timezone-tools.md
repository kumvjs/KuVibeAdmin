# M6 用户展示时区与统一时间工具完成记录

## 已确认范围

- 用户授权实现 M6 及后端统一时间工具。sys_user.timezone = null 表示跟随设备，字符串表示固定展示偏好；不将浏览器或服务器时区写成业务默认值。
- 选项公开；偏好读写只操作当前登录用户。所有入口统一校验 IANA 标识，禁止偏移字符串。沿用 ResOp 和 Swagger。
- 提供不依赖 Nest、用户表或进程默认时区的 Day.js 工具：时间点解析/展示、业务日期、包含结束日期的日期范围到半开时间点范围。所有日历操作显式指定时区。
- 时间点实体字段统一为 timestamptz 默认精度（用户最新明确要求不设置 precision），Date 保持不变。用户明确无需旧数据迁移与兼容，本次不生成或执行迁移、不执行 setup。
- 每日权益、活动时区及锁定策略由业务实现。原有列表 startTime/endTime 契约不隐式改变。当前仓库没有 Vben 前端应用，本次提供接入文档及可复用纯工具，不修改相邻前端仓库。

## 依据与实现方案

已读取本地 Vben 仓库锁定提交 63a38dce49ba109f61607994e21ba921d8e970e9 的 API 调用、mock、system 页面检索和共享时区类型。getTimezone 的调用类型允许 null；setTimezone 原为 string，清空偏好是兼容扩展，前端生成客户端需更新。选项继续采用 label/value 字符串，跟随设备由前端单独提供。

偏好直接从数据库读取，不另设偏好缓存；更新只写 timezone/updatedBy 并清除既有用户信息缓存，不影响权限或令牌。选项返回运行时支持的完整区域列表及 UTC，不写死 GMT 偏移。前端检测当前设备有效时区；后台业务必须传递明确时区。

日期严格校验，结束日期按日历加一天后重新解析边界；23/25 小时日正常处理。不存在的日期和不唯一/不存在的零点拒绝并明确说明，不由 Day.js 静默修正。首版不提供任意当地钟点解析，避免暗中选择夏令时重复时间。

## 验收

- null、有效时区跨服务实例读取；不同用户隔离；未登录拒绝；非法值及缺字段拒绝；成功响应及 OpenAPI nullable 一致。
- 管理员用户写入入口使用同一校验；偏好更新不覆盖其他资料，提交后清缓存。
- 严格日期、偏移输入、跨月/年、纽约夏令时 23/25 小时、异常零点、并发不同时区；不同 TZ 进程结果一致。
- 定向/全量测试、TS 检查、改动文件 ESLint、Nest/文档构建、锁定契约检查；真实浏览器全流程仍属于 M8。

## 版本决策

变更集 M6-timezone-tools；根 package.json 与 packages/core/package.json 基线均为 1.0.1，目标统一 1.1.0。语义/有效影响 minor：新增偏好 API、可选统一工具及开发阶段时间点类型规范，无历史兼容要求。KuVibe schema/revision 不变；通过验证后同步版本与 CHANGELOG，重试沿用此基线。

## 实现与验证结果

- 实现独立 TimezoneModule，偏好使用 sys_user.timezone，数据库直接读取；部分更新后清理既有用户缓存。Swagger 明确必填可空字段，所有 JSON 使用 ResOp。
- 提供 time.util.ts 及纯 IANA 校验装饰器，认证的 Day.js 使用统一入口。CommonEntity 与令牌过期使用 timestamptz 默认精度；附件原本已符合，无额外修改。
- 用户最新要求不配置 precision；PostgreSQL 检查实际 datetime_precision=6，半开区间包含 23:59:59.999999 而排除次日零点。Date 的毫秒精度不用于构造日末闭区间。
- 43 个 Jest 套件 / 283 项测试通过。3 项时间集成检查包含跨进程 TZ、实体元数据、真实隔离 PostgreSQL（跨连接持久化、账户隔离、禁用/软删除、部分更新、跨会话时区与微秒边界）。2 项数据库配置、3 项契约工具测试通过。
- TypeScript 测试类型检查、Nest 构建、改动代码 ESLint、VitePress 构建、git diff 检查和锁定 Vben snapshot/fixtures 校验通过。
- pnpm 自动版本切换因网络签名获取失败不可用，使用本地安装的 Node 工具；Jest 的已安装 ESM 依赖需 --experimental-vm-modules。上游网络不可达，使用相邻 Vben 仓库中的相同锁定提交创建临时检出完成验证。
- HTTP 测试注入已认证身份并运行真实 RBAC/验证/响应链；不声称完整 Passport 或浏览器 e2e。偏好数据库集成使用缓存失效替身，未新增 Redis 集成测试。
- 不修改业务库，不执行迁移/setup；仅使用无持久卷的独立 m6_test PostgreSQL 容器和随机 schema。前端接入及原列表半开区间扩展不在本次实现范围。

## 完成版本

变更集 M6-timezone-tools；semantic/effective impact minor；outcome bumped。package.json 1.0.1 → 1.1.0；packages/core/package.json 1.0.1 → 1.1.0。无依赖变化或锁文件内根包版本字段，锁文件不需重写。CHANGELOG 已同步。KuVibe release/schema/template revision 保持不变。未提交、打标签或发布。
