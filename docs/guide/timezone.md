# 时间与时区开发

框架区分时间点、业务日期和用户展示偏好。M6 管理展示偏好；签到、每日首单和结算采用哪种日历，以及是否固定账户权益时区，由业务自己决定。

## 存储与运行环境

- 创建、更新、软删除、令牌和附件过期时间使用 `timestamptz`（数据库默认精度，不配置 precision），实体属性保持 `Date`（JavaScript 仅毫秒精度，读取数据库更细精度会截断）；不要在实体 transformer 中加减小时或格式化字符串。
- 业务日期使用 `date` 与 `YYYY-MM-DD` 字符串，时区另存 IANA 标识。
- PostgreSQL 配置通过连接参数为每个连接设置 UTC。Node、容器和脚本部署建议显式设置 `TZ=UTC`；工具仍必须传入时区，不依赖此设置。
- 本次按开发阶段约定只修改实体目标模型，不生成/执行迁移；部署方负责同步表结构。旧建表迁移不会因实体更新自动变成新类型。

## 后端统一工具

从 `#/utils/time.util.js` 导入。该文件只依赖 Day.js 和 Intl，不依赖 NestJS、数据库或用户上下文；独立前端项目可复用该纯模块并安装 Day.js，但当前仓库不发布前端 npm 包。不要从包含 Node 工具的 `utils/index.ts` 引入浏览器代码。

| 工具 | 约定 |
| --- | --- |
| `dayjs` | 已加载 utc、timezone、customParseFormat；不设置全局默认业务时区 |
| `isIanaTimezone(value)` / `assertTimezone(value)` | 校验运行时支持的区域或别名及 UTC；拒绝无效值、缩写和裸偏移 |
| `getTimezoneIds()` | 返回运行时支持的区域列表及 UTC；不硬编码 GMT 偏移 |
| `parseInstant(value)` | Date 或带 Z/偏移、秒和最多三位小数的 ISO 字符串；拒绝无时区输入 |
| `formatInstant(value, timezone, format?)` | 按指定时区展示，不改变时间点；默认格式包含偏移 |
| `getBusinessDate(timezone, now?)` | 指定时间点在业务时区对应的日期；默认 now 为当前时间 |
| `getBusinessDayRange(date, timezone)` | 单个业务日的 `[startAt, endAt)` |
| `getBusinessDateRange(startDate, endDate, timezone)` | 两个日期都包含，转换成 `[startAt, endAt)` |

日期工具严格接受 1000–9999 年的 `YYYY-MM-DD`，不接受自动归一化的 2 月 30 日。终点不能超过此范围。跨日时按日历得到次日，再独立解析两个零点，因此纽约夏令时日可以是 23 或 25 小时。

首版遇到边界零点不存在、不唯一或边界日期被跳过时抛出 `RangeError`，不会替业务选择策略；需要此类历史/特殊时区边界的产品应显式扩展并测试。此工具不提供任意本地钟点到时间点的含糊解析，活动表单应提交带偏移的 ISO 时间点。工具错误由调用方在 DTO/服务边界转换成适合的 HTTP 422 等错误，不直接把编程错误当用户输入错误。

```ts
import { getBusinessDate, getBusinessDateRange } from '#/utils/time.util.js'

// timezone 来自活动、租户或账户权益规则，框架不自动读取用户展示偏好。
const businessDate = getBusinessDate(activity.timezone, occurredAt)
const { startAt, endAt } = getBusinessDateRange(
  '2026-09-10',
  '2026-10-08',
  activity.timezone,
)

qb.andWhere('record.created_at >= :startAt', { startAt })
  .andWhere('record.created_at < :endAt', { endAt })
```

Shanghai 对应起点 `2026-09-09T16:00:00.000Z`，排他终点 `2026-10-08T16:00:00.000Z`。普通 SQL 只比较时间点；业务日期列则直接比较 date，无需转换。

## 用户展示偏好与前端接入

`sys_user.timezone = null` 表示跟随当前设备；有效 IANA 字符串表示用户手动选择并跨设备保存的偏好。默认不固定为任何国家时区，也不把注册时设备探测值自动保存。偏好接口读取数据库；写入只更新当前用户偏好及审计人并失效现有用户信息缓存，不修改令牌和权限。

接口以 Swagger 为准。选项公开；个人偏好读写需要登录。选项的 label/value 均为 IANA 字符串，不携带会随夏令时过期的 GMT 偏移。前端单独添加“跟随设备”，选择后提交 null；已有偏好如果是列表未列出的有效别名，应追加对应选项供回显。

Vben v5.7.0 的 getTimezoneApi 已允许 null；原 setTimezoneApi 的参数是 string，接入时使用本项目生成的可空 DTO 或将调用类型扩展为 string | null。所有响应保持 ResOp，成功写入为 boolean。当前后端仓库不包含 Vben 应用，更新前端请求类型、日期组件及手动/跟随设备切换属于接入工作。

```ts
// 在浏览器执行，不能在服务端 SSR 中探测“用户”时区。
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const displayTimezone = savedTimezone ?? deviceTimezone
```

设备探测失败时提示选择，或明确标注 UTC 进行临时展示，不自动保存 UTC，也不成为业务权益规则。格式化历史事件的偏移按事件日期计算，不能使用当前 GMT 偏移拼接历史时间。

普通列表日期选择器应在公共转换层按页面有效时区调用 `getBusinessDateRange`，将两个 Date 序列化成 ISO 时间点发送。新接口应明确排他终点（例如 endExclusive）；不要在 Axios 拦截器中自动转换所有日期字符串。

现有用户/角色列表的 startTime/endTime 仍保留原有时间点输入和包含结束瞬间（<=）语义，本次不改变它们，也不会根据用户表隐式转换纯日期。对接这些旧接口时，前端必须遵守原接口的包含终点语义；不要将排他终点减 1 毫秒冒充完整日末，因为 PostgreSQL 默认精度高于毫秒，这会漏掉最后一毫秒内的数据。需要精确自然日过滤时，应另行扩展旧接口以支持排他终点，并同步调用方。新接口优先直接采用半开区间。纯业务日期字段（生日、结算日期）不能套用这一转换。

## 业务边界

框架没有全局 BUSINESS_TIMEZONE、可变的 dayjs.tz.setDefault 或默认 BusinessContext。业务可选择活动固定时区、租户时区或首次参与后固定的账户权益时区，并把有效时区显式传给工具。跟随设备只影响展示，不授权用户通过切换时区重新领取奖励。

按日权益的幂等键应由 userId、权益范围和 businessDate 构成，不能用可切换的 timezone/region 给同一权益生成额外资格。旅行切换、首单认定、退款和支付事件乱序等由业务定义，不放入通用时间工具或 setup 默认值。

## 验证

- `TYPEORM_TYPE=postgres node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand`（在 packages/core 中执行；当前安装的 ESM 依赖需要 VM Modules）。
- 构建后运行 `node --test test/timezone.integration.mjs`：跨进程 TZ 和实体类型检查无需数据库。
- 设置 `TIMEZONE_TEST_DATABASE_URL` 指向 localhost 上独立的 `m6_test` 数据库可追加真实持久化与跨会话时区验证；测试只创建并清理随机 m6 schema，禁止指向业务数据库。
