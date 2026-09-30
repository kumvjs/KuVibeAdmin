# 用户积分、充值套餐与订单技术方案

日期：2026-09-30；状态：设计建议，尚未实现。入口：[需求](requirement.md)、[验收](acceptance.md)、[分期计划](plan.md)。

## 1. 仓库依据与模块边界

Git基线`727dc8f`，根/backend均`1.3.0`；KuVibe `0.3.3/schema 2`与安装状态一致，属于维护。现有NestJS、Fastify、TypeORM、PostgreSQL、Redis、pnpm、ESM保持不变。

| 仓库依据 | 设计影响 |
| --- | --- |
| `packages/backend/src/app.module.ts` | 显式模块注册，全局JWT、RBAC、Origin及响应封装 |
| `src/modules/user/entities/user.entity.ts`（backend内） | bigint用户ID、软删除、状态；不直接在用户表暴露可覆盖的积分字段 |
| `src/modules/system/sys-user/sys-user.service.ts` | 删除用户撤销会话；新增财务历史保护及未付单处理 |
| `src/common/entity/common.entity.ts` | 带软删除，不直接作为不可变账本基类 |
| `src/shared/database/subscribers/audit.subscriber.ts` | 仅订阅CommonEntity；独立账本实体需显式写操作者 |
| `src/utils/time.util.ts` | 复用业务日、IANA时区和半开区间，不能自动读用户展示时区 |
| `packages/backend/package.json` | 当前无BullMQ或任务调度框架，首期采用数据库outbox与worker |

新增`modules/billing/`，分`points/catalog/promotion/order/payment/refund/jobs`。模块化单体、单数据库；事务领域服务接受EntityManager，薄控制器处理身份/DTO。用户端与管理端分离。Swagger是公共API契约权威，本文不重复列接口字段手册。

## 2. 必须成立的不变量

- 可用/冻结余额均非负；余额、批次、流水在一个事务内提交。账户sequence递增，流水前后值和delta能重放到账户最终余额。
- 一个业务幂等键只产生一次动作；相同键不同请求哈希报冲突。
- 一个渠道交易只能归属一个用户/订单，只履约一次；事件ID去重不能替代交易级唯一约束。
- 严格限量资源`reserved + sold <= limit`，每次释放/核销均引用预占记录且只执行一次。
- 所有成功充值都消耗首单事实，包括未使用首单优惠的订单；跨渠道共享事实，退款不重置。
- 价格、积分、优惠版本、业务日、渠道商品映射保存成交快照，后续编辑不追溯改旧单。
- 纠错追加冲正/补偿记录，不能删改原账本。外部支付与本地事务不可能组成一个ACID事务，依靠持久任务、外部幂等和查单恢复。

## 3. 数据模型与约束

新列显式type；积分/ID/整数金额使用bigint、应用用BigInt、JSON用字符串；输入检查数据库和渠道上限。timestamptz表示时间点，date表示业务日。外键RESTRICT，无财务级联删除；不可变事实表无软删。以下按阶段新增，M1不一次建完所有表。

| 表（拟定） | 核心内容与约束 |
| --- | --- |
| `biz_point_account` | user_id、available、frozen、sequence、状态；唯一tenant/user，余额非负CHECK |
| `biz_point_ledger` | sequence、动作、双余额delta及before/after、业务键、订单/原流水、原因、操作者、traceId；唯一账户/sequence、业务类型/业务键 |
| `biz_point_lot` | 来源订单/流水、paid/gift类型、原始/可用/冻结数量；用于溯源回收 |
| `biz_point_allocation` | 消费/冻结/冲正流水分配到哪些来源批次、各多少 |
| `biz_recharge_package`、`biz_package_version` | 稳定身份/上下架；不可变版本包含积分权益、价格、时间和限购配置 |
| `biz_channel_product` | 套餐版本、渠道、应用、环境、商店productId/offer映射、权益版本；微信/支付宝价格与内购定价分开 |
| `biz_promotion`、`biz_promotion_version` | 条件、动作、互斥组、优先级、渠道/套餐范围、活动时间与预算；规则DTO有schema版本 |
| `biz_coupon` | 券码摘要、归属、活动版本、有效期、上限；占用/核销由资源预占体系保证 |
| `biz_recharge_order` | 用户、订单号、请求键/哈希、成交快照、金额/币种/单位、业务日、有效期、状态；订单号唯一，用户请求键唯一 |
| `biz_recharge_user_state` | 唯一用户行，首笔成功订单和时间、当前微信/支付宝待付单；串行化充值权益决策 |
| `biz_recharge_user_day` | 唯一用户/业务日，首笔成功订单和时间；与是否优惠无关 |
| `biz_quota_bucket` | 套餐/活动/用户、daily/lifetime、规范period_key、limit、reserved、sold；非空资源键唯一、计数CHECK |
| `biz_order_reservation` | order/resource唯一、数量、HELD/CONSUMED/RELEASED；首单/券与额度一并追踪 |
| `biz_payment_attempt` | 渠道/应用/商户/环境、稳定请求号、渠道交易ID或token摘要、状态、金额/单位、支付时间；渠道交易身份唯一 |
| `biz_payment_event` | 事件ID/摘要、验签结果、交易关联、处理状态；去重失败可恢复，载荷脱敏/必要字段加密 |
| `biz_refund` | 原支付、稳定退款号、金额、冻结凭证、回收积分、渠道状态；一期每单至多一个活跃/成功整单退款 |
| `biz_billing_risk` | 外部强制退款已消费缺口、归属争议、异常付款，保留待追偿数量，不把余额变负 |
| `biz_outbox` | 事件键唯一、payload版本、状态、次数、next_attempt_at、lease_until、lease_token |
| `biz_billing_audit` | 调整/冲正、发布、退款审批、补偿前后信息、原因、操作者和关联号 |

Google交易以purchaseToken去重而非orderId；Apple按environment/app/transactionId唯一，originalTransactionId保留为关联信息，不能把整个购买链只发放一次。token保存加密值供查单，另存不可逆摘要建唯一索引；sandbox与生产禁止混用。

账户首次创建用唯一约束加`INSERT ... ON CONFLICT DO NOTHING`，再锁账户行。账本用独立无软删实体，显式写审计字段，并通过迁移触发器阻止UPDATE/DELETE（数据库owner仍属运维信任边界）。lifetime资源使用明确非空period_key，避免NULL唯一键失效。

索引：流水`(account_id,sequence DESC)`；订单`(user_id,created_at DESC,id DESC)`；待关闭订单`(expires_at,id)`部分索引；待执行任务`(next_attempt_at,id)`部分索引；渠道交易唯一索引。查询游标分页、限定时间范围/页大小，导出异步限量。分区/分片待实测，必须保留跨分区交易去重。

## 4. 积分增减、冻结、冲正

统一内部命令grant/debit/freeze/capture/unfreeze/reverse。普通用户不能直接调用加减命令；后台每种动作独立权限、必填原因/业务凭证/幂等键。禁止直接设余额。

事务：按全局顺序加锁 → 查业务键及请求哈希 → 校验正整数、状态、余额、原动作剩余额 → 锁批次并分配 → 更新账户/批次 → 写流水/分配/审计/outbox → 提交。首期先用赠分再用基础积分，各类FIFO；冻结保留批次归属。账户条件更新同时防透支：

```sql
UPDATE biz_point_account
SET available = available - :amount, sequence = sequence + 1
WHERE id = :account_id AND available >= :amount
RETURNING available, frozen, sequence;
```

0行是业务拒绝，不能盲目重试。冻结可用减/冻结加，解冻反向，capture只扣冻结。流水写失败必须回滚余额。借记冲正恢复原来源批次；贷记冲正只能回收该来源尚未消费的积分，不能挪用其他充值；累计冲正不能超原动作。冻结凭证和退款冻结额不能被普通扣减绕过。

## 5. 套餐、优惠和首单

### 套餐与额度

支持草稿/上架/下架、销售起止、排序、基础积分、套餐赠分、总限量/日限量/用户日与累计限购。下架只阻止新单，已成交按快照履约。额度按稳定套餐/活动ID建桶，版本发布不清零。每日懒创建唯一桶，不依赖午夜清Redis。调低limit需锁桶且不小于sold+reserved；退款不回补成功销量。

### 优惠引擎

条件（首单/门槛/用户/时间/套餐/渠道）、动作（减免/折扣/赠分）、额度、互斥组分离，用版本化枚举DTO，不执行任意脚本。

- 微信/支付宝：每单最多一个金额优惠，直减/满减/折扣/券互斥；满减以标价判断。折扣用整数basis points应付比例，9000为九折，向下取整，最低1分。
- 每单最多一个活动赠分，套餐固定赠分单列。用户首单/每日首单默认互斥，后续叠加须明确新版本。
- 多候选按实付最少、总积分最多、优先级、稳定ID排序。预算不足的候选不可用，报价返回可解释结果。
- 定向券验归属，公共码防枚举；次数、减免金额预算、赠分预算按实际数量事务预占。
- 内购不能直接将后台计算金额传给商店扣款；固定SKU/经商店配置的offer映射实际价格。现金券仅在对应渠道明确支持且已配置映射时启用，不能假装四渠道能力一样。
- 报价不占库存/资格，下单重新计算；确认金额或版本变化返回需重新确认，不能静默加价。

例：100元、1000基础分+100套餐赠分；九折和减20元券选后者，实付80元；首单赠200与每日首单赠50选200，总积分1300。这个金额组合适用于微信/支付宝；内购需对应商店商品，不能复用80元作为任意商店扣款参数。

### 跨渠道首单与业务日（用户已确认差异方案）

推荐统一将“成功充值”定义为服务端首次验真并提交履约事务；以用户状态行锁获得唯一顺序，保存settled_at/settlement_sequence，渠道paid_at单独保存用于对账。延迟通知不追溯撤销其他已发首单奖励。每日首单归属settled_at的Asia/Shanghai日期；所有渠道、所有成功充值均更新事实。

为避免提前承诺但被另一渠道抢先付款破坏定价，首期跨渠道首单优惠统一为结算时判定的赠分，不作为提前降低现金应付的条件。预览明确“结算时满足条件才赠送”；固定套餐积分必须足额发放。已有确定额度的非首单活动可在微信/支付宝下单时锁定。用户若要求首单直接减现金，需要单独设计跨渠道互斥和晚付款补偿，不能只加count查询。

微信/支付宝限量业务日采用下单日，截止为min(创建+15分钟、次日零点、锁定活动结束)。渠道截止前成功但晚回调，仍核销原日库存；首单日按结算日。库存日与首单日分字段、前台文案明确，不能混为一个business_date。活动型首单赠分按结算时有效规则及预算判断，订单保存实际命中规则版本。

## 6. 四渠道适配

统一PaymentProvider以能力描述为入口：create/query/close/verify/refund/acknowledge，不支持的能力显式返回不支持，不能伪造成功。支付事实与权益履约分离建状态。

| 渠道 | 接入与验真 | 交易完成/退款差异 |
| --- | --- | --- |
| 微信支付 | APIv3签名、通知验签解密、商户/应用/金额/币种校验；App/JSAPI/Native按实际客户端选择 | 查单/关单、退款及退款查询；外部调用在DB事务外 |
| 支付宝 | 服务端签名验签、商户/应用/金额/交易状态校验；App或网页产品按客户端选择 | 查单/关单/退款及查询；异步回包适配渠道协议 |
| Apple IAP | 消耗型商品、StoreKit交易、服务端JWS验证及查询、app/bundle/environment/product/account绑定、Notifications V2 | 已持久入账后完成交易；消费上报/退款通知按Apple流程，不能套用商户随意关单/退款 |
| Google Play | 一次性可消耗商品、服务端purchaseToken查验、package/product/account绑定、RTDN通知再查单 | PURCHASED才履约；入账后消费确认outbox，处理pending、撤销与退款 |

IAP客户端上报仅为查验线索，不信任客户端价格、购买状态或用户ID。Apple appAccountToken和Google混淆账户标识由服务端映射用户；其他用户重放凭据不得转移归属。缺少绑定证据的历史交易进入待认领审核，不能默认给第一个提交人。渠道price/currency有则从可信交易信息取，缺少时保留待对账状态而非使用客户端金额；商品及权益映射是发分依据。

Google优先在后端验证并消费；购买处于PENDING不发分，确认截止从PURCHASED开始计算，要求立即执行并监控三天窗口，具体依据[Google集成文档](https://developer.android.com/google/play/billing/integrate)。transaction/token重复与归属校验依据[Google安全文档](https://developer.android.com/google/play/billing/security)。

Apple使用[App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)查询交易、退款与通知历史，结合Notifications V2。客户端StoreKit [finish](https://developer.apple.com/documentation/storekit/transaction/finish())只能在服务端已持久确认发放后执行；具体服务端完成能力按接入时API/商品验证，不把客户端finish当后端已记账的证据。消费型权益不能依靠客户端“恢复购买”代替自有永久账本。

### 内购限量与长时间待付

已确认：严格日限量、现金优惠预占在微信/支付宝开放；IAP SKU提供固定积分权益、不加无法可靠关闭的严格库存，首单/每日首单等动态赠分以验真结算为准，可配置活动赠分预算。商店购买可能在本地下单过期后才完成，正常有效交易仍须按其商品映射交付固定权益。

以下为未采用的替代方案，仅供未来变更评估。若四渠道统一严格库存：IAP启动前预占并绑定购买上下文，PENDING/状态未知期间保留额度，不能按15分钟或午夜释放；库存日固定为预占日。只有确认不会成功或可兑现的退款/补偿方案落实后才能释放。Apple无法照搬商户自动退款，必须单列人工/商店退款流程；极晚或失去上下文的有效交易不能静默吞款，也不能强行超卖。此分支须用户明确接受后实现，不能同时承诺“严格限量、迅速释放、所有迟付照常发放”。

## 7. 订单、支付与资源事务

状态分别记录：订单PENDING_PAYMENT/PAID/CLOSING/CLOSED/PAYMENT_EXCEPTION；支付CREATING/PENDING/SUCCEEDED/FAILED/UNKNOWN；退款另有状态，不能覆盖原成功支付事实。IAP增加PENDING_EXTERNAL、VERIFIED、ACK_PENDING等实际所需投影。

下单：锁用户状态 → 检查用户状态、现有有效单/请求幂等 → 服务器重算报价 → 字典序预占额度/券 → 写订单快照/支付准备outbox → 提交。客户端不能指定他人userId、tenantId或实付积分。

事务外创建支付，稳定商户请求号；超时先查单再重试。同一微信/支付宝订单只保留一个有效支付尝试，切换渠道前安全关闭旧交易。IAP上下文创建不代表已经产生一笔商店交易。

回调/客户端凭据/主动查单进入统一验真和结算入口：先外部验证，随后按固定顺序锁用户状态/结算日状态 → 订单 → 账户 → 额度/资格 → 来源批次；同事务保存支付事实、核销预占、判定首单、发基础/赠分、写流水和实际优惠快照、置PAID、写确认/通知outbox。所有成功单更新首单事实，不依赖是否使用首单活动。

首单赠分预算或领取记录的唯一键必须包含用户+权益类型+日/lifetime；若成功充值未获赠分（例如活动预算不足），其首单事实仍被消耗。不要让后来的订单补领首单。

重复事件只有在确认业务已处理后才直接成功响应；未完成事件可重试。同交易不同事件仍只发一次。回调失败按渠道协议返回可重试响应，或者持久化inbox后成功应答并保证worker恢复，两者按渠道延迟预算明确选择，不能先应答后仅放内存队列。

回调路由独立验签、按渠道格式跳过全局响应封装，保留普通接口JWT/Origin/RBAC。Fastify原始体读取、体积限制、证书轮换、Google推送身份/audience验证在渠道集成阶段测试。业务验签不能由IP白名单替代。

关闭：扫描候选ID，按统一锁序认领，事务外查单/关单；确定未支付且不可再付款才事务释放。查无结果/超时不代表关单成功。回调若先成功则禁止释放；已安全关闭后意外到账进入异常收款/退款补偿。`HELD→CONSUMED`才reserved减/sold加，`HELD→RELEASED`才reserved减，条件更新确保重复无副作用。

## 8. 退款、用户生命周期与对账

主动整单退款需原订单基础+赠分的对应批次均未消费且可冻结，不能只看账户总余额或挪用其他充值。事务冻结来源积分、建立唯一退款单/outbox；外部执行；成功capture并追加退款流水，确定失败解冻，未知保持冻结并查证。已被渠道强制退款时无论积分够不够都记真实退款，回收尚存部分，差额进risk并限制消费/人工处理，不变负余额。

Apple退款由商店流程决定，客户端发起申请/服务端消费信息协助与结果通知；不能把后台批准当成Apple已退款。Google及微信/支付宝按各自可用退款API执行。退款不恢复首单、券成功用量或成功销量。部分退款、按消费比例折算首期不支持。

用户软删除/禁用保留财务历史，新订单拒绝；订单创建与删除协调sys_user锁。既有收款不能因用户已退出或被禁用而丢弃，仍持久记事实与权益，并限制可消费状态、按渠道走补偿；内部查询包含必要软删除用户。财务外键无级联。

对账四层：账户=流水delta汇总；账户=来源批次汇总；订单应发/退款应扣=关联流水；渠道支付/退款账单=本地支付事实。另核对quota与预占记录。渠道账单迟到用重叠窗口/水位补拉，Apple通知历史、Google撤销记录用于补偿，不把不同渠道接口伪装成同一个账单接口。

差异分类：渠道有本地无、金额/币种不符、付款未发分、退款未扣分、资格/库存泄漏。修复调用带幂等键的领域命令，留审批审计，不直接改余额掩盖缺口。

## 9. 高并发、热点和恢复

PostgreSQL为权威；Redis只缓存套餐和限流，不决定最终余额/库存/资格。Redis故障收紧流量，数据库约束继续兜底；DB不可用拒绝写，不能假成功。

采用READ COMMITTED + 行锁/条件更新/唯一约束；跨行不变量必须有稳定锁行。全局锁序：需协调删除时先sys_user → 用户充值状态（lifetime再day）→订单→账户→额度/资格键排序→批次ID排序。纯积分操作从账户起，不反向拿前序锁。多个账户按ID排序，事务内无外部HTTP。依据[PostgreSQL行锁说明](https://www.postgresql.org/docs/18/explicit-locking.html)与[事务隔离说明](https://www.postgresql.org/docs/18/transaction-iso.html)。

死锁40P01/序列化失败40001最多3次整体事务尝试，指数退避/抖动。业务拒绝不重试；唯一冲突先回滚再查，不在已失败事务中继续SQL。建议初始lock_timeout=1s、statement_timeout=3s，按实测调整。

热门套餐单额度行是串行热点，先短事务、限流、限制待付占额和池预算。不能承诺无限吞吐。确有瓶颈再分配多个配额桶，桶总配额不得超总上限；不把Redis Lua成功当最终出售。同账户串行是余额一致性必要代价。

首期DB outbox+worker：用`FOR UPDATE SKIP LOCKED`认领任务、保存租约后提交，再执行外部请求。它适合队列，不用于跳过账本数据，[官方SELECT说明](https://www.postgresql.org/docs/18/sql-select.html)。任务至少一次，稳定外部请求号+查单抵抗崩溃重试；完成更新带lease_token防旧worker覆盖。超时租约重领、续租、退避、死信、人工重放和审计必须实现。

初始参数建议：微信/支付宝预占15分钟；用户每分钟创建5单；worker每批50、租约60秒；均需压测。API+worker池总和受DB连接预算约束，给回调、恢复和运维预留容量。列表/导出不能拖垮写事务。

监控：负余额/超卖/重复发放必须0，锁等待/死锁、paid未履约、确认超期、outbox积压/死信、退款未知、对账差异。建议付款已验真未履约60秒告警、恢复积压5分钟升级；外部渠道故障不承诺到账时间。日志带trace/order/payment/refund/job ID，不输出密钥、完整token或敏感载荷。

## 10. 权限、迁移与发布

账户/流水查询、增加、扣减、冲正、套餐编辑/发布、活动编辑/发布、订单查询/关闭、退款审批/执行、对账修复独立权限。沿用RequirePermissions及setup种子，普通用户只看自己；不能以列表权限代替资金写权限。

每阶段实体与迁移共同交付，生成/审查时使用[Atlas Skill](../../../skills/atlas/SKILL.md)。隔离库重放旧迁移、插旧用户/权限等样本、应用新迁移、检查约束/数据/索引/实体差异；空库可验证down，有财务记录禁止DROP回滚，关闭入口并前向修复或按备份恢复演练。

先建表、部署默认关闭的应用/worker、补权限、完成沙箱验证后启用。当前migration脚本固定local，不能直接作为生产入口。无商户/商店配置可做单元/契约桩，但不能标记真实联调通过；内购还需要外部App测试工程。生产明确拒绝模拟支付适配器。

当前docs有历史阶段的“不执行迁移”说明，不作为本需求豁免。开发遵循当前AGENTS/Atlas流程。团队使用说明统一引用[快速开始](../../../../docs/guide/getting-started.md#团队统一使用方式)。

## 11. 取舍与来源局限

采用单库事务账本，保留outbox扩展点；不引入微服务/独立MQ/Saga制造跨服务一致性负担。分片、积分有效期、部分退款、多单并行及首单现金折扣另行评估。

已读取PostgreSQL、Apple、Google官方资料；微信/支付宝官方动态文档本次检索未获得可引用正文，其具体API、参数、签名实现和产品能力必须在M4重新核验。本文为架构约束，未声称渠道适配或政策审核已经完成。
