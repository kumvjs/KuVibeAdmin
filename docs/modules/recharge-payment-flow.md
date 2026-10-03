# 充值接入：套餐、订单、支付与回调

本文描述已实现的服务端契约。默认 HTTP 前缀 `/api`，下文路径省略前缀；本人接口须登录，响应使用统一包裹，字段以 Swagger 为准。Apple/Google 须原生 App；网页只发起微信/支付宝扫码。真实商户、商店证书和客户端透传仍须实际联调。

## 三类记录与共享商品

复用现有 `biz_recharge_order` 保存业务套餐、不可变版本与权益快照；`biz_payment_attempt` 保存支付意图和绑定参数；`biz_payment_transaction` 保存验真的平台交易。付款与业务订单允许暂时没有关联。首次交易事实、交易身份不可修改，最新验真状态单独保存。

同一商店、应用、环境、Product ID 可以被多个套餐版本引用，但站内标价和基础积分必须一致；套餐赠分和活动赠送可以不同。旧映射不可覆盖。`productId + 金额` 无法确定购买的是日常套餐还是活动套餐，不能用来猜订单。

正常购买先创建业务订单和支付意图，再唤起支付。回调或恢复交易缺少可靠关联时，只创建/更新平台流水，**不自动创建业务订单、不发积分、不占首单资格**。

## 1. 获取套餐和报价

1. `GET /recharge/packages` 获取销售期内已发布套餐，保留字符串 `id`、`versionId`。
2. 内购使用 `GET /recharge/packages/versions/:versionId/products`，按渠道、应用和环境选择映射，保留 `channelProductId`；向商店另查展示价格。
3. `GET /recharge/packages/:packageId/quote` 传渠道，内购另传映射 ID；微信/支付宝可传券码，内购禁止站内券码。
4. 展示基础积分、套餐赠分和预计活动赠分。报价不预占名额、预算或首单资格。内购的站内实付金额与币种为 `null`，赠分以验真入账为准。

管理端 `GET /system/billing/packages` 是全状态分页列表；`GET /system/billing/packages/:id` 单独读取当前套餐详情和映射。普通客户端不能使用管理列表代替销售列表。

## 2. 创建业务订单

`POST /recharge/orders` 提交套餐 ID、版本 ID、渠道、客户端形式和幂等键。微信/支付宝提交报价 `payableMinor`（整数分）；内购提交 `channelProductId`、`client: "app"`，禁止传 `payableMinor`。

四渠道均在事务内预占套餐总量、日量、用户累计和用户每日额度；`null` 不限、`"0"` 禁止购买。创建失败不能继续唤起商店购买。同次购买重试复用原幂等键，键相同但请求不同返回冲突；版本变更返回 409，应重新报价确认。

现金订单每用户只允许一笔未结束订单。Google 同一用户、应用、环境、SKU 在有效预占期内只允许一笔待付订单，避免共用 SKU 的业务意图重叠。订单 ID、积分、金额和数量按字符串处理；下单不发分。

## 3. 获取支付意图并发起支付

`POST /recharge/orders/:orderId/payment` 返回准备状态。`queued/starting` 时重试同一订单，`ready` 才使用返回的 `parameters`。

| 平台 | 本系统提供的关联参数 | 平台格式与用途 |
| --- | --- | --- |
| Apple | 每笔支付意图的 UUID `appAccountToken` | UUID；交易验签后用它定位原订单 |
| Google | 稳定的不透明 `obfuscatedAccountId` | 账号标识，最多 64 字符；UUID 非必需。本系统不再用每单 UUID 填 `obfuscatedProfileId` |
| 微信 | 固定 `merchantNo` → `out_trade_no` | 平台允许 6–32 字符；本系统使用 32 位十六进制字符串 |
| 支付宝 | 固定 `merchantNo` → `out_trade_no` | 最多 64 字符，字母/数字/下划线；同一 32 位订单号兼容 |

Apple 原生购买原样传 `appAccountToken`。uni-app 的 `username` 是否映射旧 StoreKit `applicationUsername` 须核实插件；UUID 才能作为 Apple 持久化的 `appAccountToken`，普通用户名不可靠。[Apple 绑定文档](https://developer.apple.com/documentation/appstoreservernotifications/appaccounttoken)、[官方服务端 SDK](https://github.com/apple/app-store-server-library-node)。

Google `obfuscatedAccountId`/`obfuscatedProfileId` 分别表示账号/资料，并不是通用商户订单号。客户端须保留原业务订单 ID，支付后把 `purchaseToken` 连同原订单上下文提交。服务端核对账号、应用、环境、SKU、数量和购买完成时间，再绑定一次性 token。旧已生成的 profile UUID 意图保留原校验方式，不改写历史参数。[Google 参数文档](https://developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder)。

## 4. 金额：展示、实付与业务权益分开

下单不使用浮点金额。现金渠道严格核对站内确认金额；内购按已确认 SKU 与业务订单确定权益，商店地区、币种、税费和优惠决定平台价格，不能把站内 CNY 标价伪装成商店实付。

| 数据来源 | 单位/格式 | 9.9 的例子 |
| --- | --- | --- |
| 站内现金金额、微信 `amount.total` | 正整数 CNY 分 | `"990"` → 微信整数 `990`，币种 `CNY` |
| 支付宝 `total_amount` | 元，两位小数字符串，范围 0.01–100000000 | `"9.90"`；整数分转换，禁止浮点乘除 |
| Apple 验签交易 `price` | milliunits，货币单位的 1/1000 | `9900`，连同交易 `currency` 保存 |
| Google SDK 展示 `priceAmountMicros` | micros，货币单位的 1/1000000 | `9900000`；仅用于展示，不能当作已付款证据 |
| Google Orders API `total` | `Money`：币种、整单位字符串 `units`、`nanos` | `{currencyCode:"CNY",units:"9",nanos:900000000}` |

平台流水 `amountMinor` 仅用于微信/支付宝 CNY 分；内购为 `null`。内购 `platformAmount={value,scale,currency,source}` 保留原始精度，Apple 为 `value:"9900",scale:3`，Google 为 `value:"9900000000",scale:9`。格式化使用 BigInt，不经过 Number。

Google productsv2 用于验真购买，并不提供实付金额。服务端使用订单号查询 Orders API，确认订单号、token、SKU 都属于同笔交易后读取 `total`；查询失败不丢弃已验真的购买事实，保留金额未知并通过持久任务补查。未知金额绝不填套餐价。Apple `price` 是交易价格字段，财务结算仍须对应平台财务报告；本页面不等同于财务结算报表。[Apple price](https://developer.apple.com/documentation/appstoreserverapi/price)、[Google 展示价格](https://developer.android.com/reference/com/android/billingclient/api/ProductDetails.OneTimePurchaseOfferDetails)、[Google Orders](https://developers.google.com/android-publisher/api-ref/rest/v3/orders)、[Money](https://developers.google.com/android-publisher/api-ref/rest/v3/Money)。

## 5. 客户端凭据与恢复

Apple 调用 `POST /recharge/orders/:orderId/apple-receipt`，请求体 `{transactionId}`；uni-app 使用 `transactionIdentifier`。Google 调用对应的 `google-receipt`，请求体 `{purchaseToken}`。凭据只通过 HTTPS 请求体提交，不进 URL、日志或埋点。

App 丢失本地订单上下文时使用独立补报接口：

- `POST /recharge/payments/apple-receipt`：`applicationId`、`environment`，以及 `transactionId` 或旧 Base64 `transactionReceipt`。优先交易 ID；官方 SDK `ReceiptUtility` 只提取交易 ID，随后另查商店并验签，不保存完整收据。
- `POST /recharge/payments/google-receipt`：`applicationId`、`environment`、`purchaseToken`。token 加密保存。

补报人的登录态只记录申报人，不证明付款归属。客户端 `requestPayment:ok`、解析后的 receipt `status:0` 都不能替代服务端验真。提交返回 `inboxId` 只表示任务已保存；查询原订单 `GET /recharge/orders/:orderId`，以 `status:"paid"` 和非空 `settlement` 确认到账。实际 `giftPoints` 已含 `bonusPoints`，不能再相加。

Apple 确认权益持久入账后才 `finish`。Google 服务端入账后异步 `consume`，消费失败保留任务，不回滚已到账权益；客户端不能先消费。Google `PENDING` 不发分、不消费、不计首单。

## 6. 渠道通知和匹配

| 平台 | 通知路径（含前缀） | 验真方式 |
| --- | --- | --- |
| 微信 | `/api/payments/wechat/notify` | 原始体验签、AES-GCM 解密 |
| 微信退款 | `/api/payments/wechat/refund-notify` | 验签解密后查询退款状态 |
| 支付宝 | `/api/payments/alipay/notify` | 官方 SDK RSA2 验签 |
| Apple | `/api/payments/apple/notify` | Notifications V2 JWS、官方 SDK 查交易并验证证书链 |
| Google | `/api/payments/google/notify` | Pub/Sub OIDC 身份/受众，后台 productsv2 查询 |

HTTP 成功仅表示通知已持久化。查验后的真实交易按平台交易键 UPSERT，首次事实不改写，最新状态独立保存。Apple 按应用/环境/transactionId，Google 按 purchaseToken 摘要去重；Google orderId 只用来查询对账，不能作为唯一购买身份。

Apple UUID 可找到原订单；Google 新意图的 RTDN 没有原业务订单上下文，先落未关联流水，等待客户端补报原订单或已保存关联恢复。不得根据相同用户和 SKU 猜是哪笔套餐。

可关联的交易复用结算服务，额度核销、积分流水、首单/连续事实、订单状态与履约状态同事务提交。不能关联则 `unmatched`，校验矛盾、数量异常或迟到等情况留待核查。重复、乱序和退款通知复用同笔流水；已确认退款不能被旧成功通知覆盖。

## 7. 30 分钟期限与人工处置

新建现金和内购订单统一 30 分钟预占期限，响应提供 `expiresAt`。旧单不改写原到期时间，旧内购 `expiresAt=null` 保留历史契约。

现金已发起支付后，到期进入 `closing`，必须确认同商户/应用/订单已关单才释放名额；网络未知继续保留预占。内购无法通过本地关单阻止商店收款，到期直接一次性释放套餐预占。worker 与结算事务都会检查期限，任务延迟不能绕过。释放后才完成的付款，或到期后才进入自动结算的付款，保留平台流水并转人工核查，不再自动发分或抢占已释放名额。

自动恢复未关联交易最多三天，期间持续验真；后台“平台支付流水”可按平台、关联状态和交易键查询，未知金额明确展示。权限分别为 `system:billing:payment:read/recheck/bind`。

重新验真和人工关联均须填写核查依据并记录操作者。人工关联仅允许单件、已验真、没有矛盾归属的付款与有效、尚未入账且名额未释放的业务订单；关联后仍由后台重新验真履约。不能改绑已关联交易、跳过额度或给已关闭旧单直接设 paid。迟到款交客服核实并按商店退款/业务补偿流程处理；本接口不提供内购主动退款。

Google 从 `PURCHASED` 起须在三天内确认，否则自动退款；`PENDING` 不开始这段确认期限。消耗型 `consume` 同时完成确认，异常支付不能无限承诺保留扣款。[Google 处理流程](https://developer.android.com/google/play/billing/integrate#process)。

## 升级与验证

迁移 `1790992800000` 保留旧流水 ID、首次事实、订单、账本与原绑定参数；回填的历史最新事实是原首次快照，并非迁移时重新查询商店，运营核查应重新验真。修改商品唯一索引、流水关联约束并更新保护触发器，需要停止全部旧 API/worker，先迁移再统一启动新代码，不能混跑。

迁移设置 5 秒锁超时；索引重建及历史流水回填需要维护窗口，实际规模须事先评估。独立流水、最新事实变更、人工绑定或共享 SKU 使用后拒绝有损 down；保留结构前向修复。备份数据库、附件和相应凭据密钥，不能只恢复数据库。隔离测试与真实商店门槛见[充值业务](recharge.md)、[账务运维](billing-operations.md)。
