# 充值套餐与优惠

当前已实现积分账户、套餐运营、订单创建/查询/取消、四渠道支付验真适配及统一入账，并提供仓库内 Vben playground 管理与本人充值页面。渠道默认关闭，尚未完成真实商户/商店和客户端联调。不能使用报价、客户端支付结果或pending订单作为到账凭证。后端接口及DTO以Swagger为准。

客户端顺序、渠道通知、交易恢复及当前实现限制见[充值接入流程](recharge-payment-flow.md)。

## 套餐与版本

管理权限分为查看、编辑、发布；套餐首次创建为草稿。修改价格、积分、销售时间和限购会新增版本，历史版本不可改删。发布当前版本后，登录用户可分页查询销售期内的套餐及报价。

站内现金金额以CNY分、积分和数量以整数字符串传输，避免JavaScript Number精度损失。内购平台金额单独保留原始币种和精度，见接入流程。时间必须有明确UTC偏移，销售区间为左闭右开。所有每日规则采用`Asia/Shanghai`，不读取用户展示时区。

四渠道套餐支持总限量、每日限量、用户累计限购和用户每日限购。`null`表示不限、`"0"`表示不可购买。计数按稳定套餐ID保存，改价不重置。下调总限额不得低于已售和预占；每日限额核对当前业务日，历史日不阻止以后合理降额。

Apple/Google允许多个套餐版本引用同一商店、应用、环境和商品ID，但站内标价与基础积分必须一致，赠分可不同；旧映射不可覆盖。正常购买先创建业务订单与支付意图，不凭SKU猜套餐。商店决定展示和扣款价格，原始实付精度单独记录；内购也预占四类套餐额度，不使用站内现金券。

## 活动、首单与券

支持满额减免、折扣比例、固定赠分和比例赠分；比例使用basis points，10000表示100%。折扣按整数向下取整，最低支付1分。现金和活动赠分各选择一项对用户最优的优惠，不叠加同类型活动；同值按优先级、稳定ID打破平局。比例赠分基数为套餐基础积分。

活动可限制渠道、套餐、原价门槛、次数、用户次数、用户每日次数、现金预算和赠分预算。首单仅支持赠分：用户首单和每日首单按服务端成功验真入账判定，退款不恢复资格。首单事实在数据库中禁止重置或删除。

活动改动新增版本。券码仅保存大小写归一后的摘要，可绑定用户、有效期和次数；发放时固定活动版本的优惠权益，运营下调预算仍约束旧券。券有效期须包含在绑定活动的有效期内，未发布或停用的活动不能使用。

## 连续充值赠送

优惠类型 `bonus_consecutive` 按同一用户、同一稳定套餐 ID、北京时间（Asia/Shanghai）的成功入账日统计连续天数。跨渠道和套餐改版继续累计，各套餐独立；同日多笔算一天，断一天后从第 1 天重新开始。待付、失败和取消不计数，退款保留成功事实，不重领当天首笔赠送。

配置最大天数（1–366）及第 1 到最大天数的逐日赠送积分，数量用非负整数字符串，可为 0。超过最大天数持续按最后一天额度赠送。例如设置 3 天及 `["10","20","30"]`，连续第 4 天起仍赠送 30，断充后恢复第 1 天的 10。赠送频率 `consecutiveGrantMode` 可选 `daily_first`（默认，每天本套餐首笔成功充值）或 `every_order`（每笔成功充值）。

连续活动只增加赠送积分，不减免充值金额。活动在订单适用范围内时，微信/支付宝每笔按套餐定价收费，不同时使用现金减免；Apple/Google 扣款由商店决定。连续赠送与其他活动赠分择优一项，套餐原有赠分照常发放。活动未开始、已结束或不适用于该渠道/套餐时，继续原有其他活动规则。

报价提供本次预计连续天数和预计赠分，不承诺名额；真正赠送在验真结算、持有用户锁后重新计算并检查活动有效期和预算。预算不足仍入账基础/套餐赠分并记录成功充值，后续当天订单不能补领已错过的每天首笔资格。活动改版不清除连续天数，已有订单保留活动规则快照；结算事件记录实际业务日和连续天数。

新表 `biz_recharge_package_streak` 保存每用户、套餐最近成功日和连续天数，与订单和积分同事务提交。旧用户缺少状态时从 `settled_at` 和 `paid_ledger_id` 回放历史成功日，包含已退款订单；升级不批量改写旧账本。首次回放使用现有用户订单索引，历史订单极多时需按实际规模评估首笔延迟。

## 报价与并发额度

报价仅用于预览，不锁库存、预算或首单资格。保底活动赠分与预计赠分不可相加；预计赠分可能包括入账时才判定的首单活动。实际订单必须在事务内重新校验套餐/活动版本、销售时间、用户资格与预算。内购活动赠分全部以验真入账时的规则判定。

数据库额度桶记录预占和已售，具有非负与容量约束。预占按固定资源顺序加行锁，多项额度任一不足时全部回滚；订单与预占凭证必须在同一事务提交。核销和释放仅可对一次性的有效订单凭证进行，不能把内部额度方法直接暴露成API。

## 订单与后台恢复

下单必须提交用户确认的套餐版本ID、渠道、App/扫码形式和幂等键；微信/支付宝还须提交确认的整数分金额。套餐改版或报价变更返回409，需要重新报价。同键相同请求返回原订单，不再扣占；同键不同参数返回409。

订单、不可变价格/权益/优惠快照、持久预占凭证、审计事件及outbox在一个事务提交。本人只能读取/取消本人订单；管理查看使用独立订单权限。微信/支付宝每位用户只保留一笔未结束订单，避免反复下单占光优惠和库存；内购不采用此现金订单限制。

未向渠道发起请求的现金订单可以本地关单并一次性释放预占。已发起支付的取消或30分钟到期订单进入`closing`，必须先查单和确认渠道关单，不能仅依赖时间到期释放库存。网络失败、渠道查单“交易不存在”或未确认关单均视为未知，保留预占。新建内购同为30分钟期限，到期释放预占，迟到款留人工核查，不提供站内取消接口；旧无到期内购单保持原契约。

后台worker每5秒领取任务，每批最多5个并行处理，数据库使用`FOR UPDATE SKIP LOCKED`和120秒租约，可由多个后端实例同时运行。崩溃后租约过期重新领取；每次租约令牌不同，旧worker不能完成新租约。失败指数退避至最多300秒，10次后保留`dead`记录供运维处理。业务处理须保持幂等，因为外部网络效果与数据库提交不能保证一起发生。

设置`BILLING_WORKER_ENABLED=false`可停用当前实例的后台任务。运营前检查长期`closing`、`dead`、通知`review`和预占余额，不使用手工改快照/删流水绕过补偿。

## 微信与支付宝接入

复制`docker/billing.example.json`到忽略的`.secrets/billing/config.json`，填写商户身份、密钥/公钥文件与HTTPS回调地址。所有文件路径相对于配置文件；密钥只放在`.secrets/billing/`，Compose以只读方式挂载到`/app/secrets/billing`。在对应环境文件设置`BILLING_CONFIG_FILE=/app/secrets/billing/config.json`，检查配置后将需要的渠道`enabled`设为`true`并重建容器。默认没有配置，支付准备返回503，不会伪造支付成功。当前私钥模式不包含支付宝应用证书模式，微信需手动维护可信支付公钥ID/证书及轮换重叠窗口。

用户下单后调用支付准备接口，`queued/starting`时稍后用同一订单重试，`ready`时读取扫码URL或App SDK参数。准备任务在网络请求前持久化“已发起支付”事实；超时按相同商户订单号重试。客户端回报成功仅用来促使查询，不作为发积分的依据。

微信对原始请求体做RSA-SHA256验签、可信公钥ID和五分钟时间窗口检查，再AES-GCM解密；支付宝使用官方SDK的RSA2通知验签及应答验签。回调验证后先写不可变通知记录和outbox，再分别返回微信204或支付宝纯文本`success`。通知/支付参数/券码不会出现在请求响应日志中。

结算重新校验商户、应用、环境、订单、金额、币种及数量，交易标识唯一且一笔订单只能关联一笔交易。预占核销、基础/赠送积分流水、用户累计/当日首单和支付状态原子提交。首单赠分按入账时判定；活动预算不足不影响基础权益，原保证赠分仍兑现。已关闭订单的迟到款保留待审，不利用已释放库存继续履约，可在管理端原路全额退款。

实现依据：[微信App下单](https://pay.wechatpay.cn/doc/v3/merchant/4013070347)、[微信Native下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)、[支付宝官方Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all)。上线前仍须完成真实商户权限、回调地址和客户端联调。

## 消耗型内购接入

Apple使用官方App Store Server SDK、在线证书状态检查和可信Apple根证书验证JWS，环境仅允许Sandbox/Production；禁止Xcode/LocalTesting免验证环境。配置bundleId、环境、Issuer/Key ID、服务端私钥和根证书；Production还必须配置正整数`appAppleId`。Google服务账户需要Android Publisher权限，启用对应应用与环境，配置Pub/Sub推送受众URL和精确推送服务账户邮箱。

准备接口返回SKU与绑定参数：Apple传每笔意图的UUID `appAccountToken`；Google传稳定混淆账号`obfuscatedAccountId`，客户端保留并补报原业务订单，不用每单UUID填profile字段。Google同用户/应用/环境/SKU在有效预占期内仅一笔待付订单。用户通过本人订单提交Apple transactionId或Google purchaseToken，服务端保存任务再查询商店，核对应用、环境、SKU、单件数量和归属。Google以purchaseToken摘要去重，订单号只用于查询对账。

Apple客户端必须保留未完成交易，仅在本人订单状态`paid`后调用StoreKit finish；服务端消费型Google权益入账后才排队调用consume。Google consume同时完成消费确认，网络失败不会回滚已入账权益，原任务保留重试；客户端不要先consume再等待后端。跨设备重提原订单/原交易使用相同绑定，不允许把旧交易转给另一个站内账号。

Google `PENDING`不发积分、不占首单、不消费确认；正常等待按60秒延迟并重置失败计数，最多自动恢复三天。网络/验真错误仍按故障退避，十次后需要运营处理。商店确认取消可结束尚未入账订单。新内购30分钟到期释放预占，迟到款留核查；旧无到期订单保持旧契约。

Apple通知通过JWS验真，Google RTDN通过OIDC校验受众、issuer、email_verified及推送服务账户。异步验真后均创建/更新独立平台流水；Apple凭UUID定位已有订单，Google新意图须客户端原订单补报或已知关联，不能凭账号/SKU猜订单。无可靠归属的真实支付留未关联流水，不自动创建业务订单或发分；后台提供审计重新验真和人工关联。部分退款、多件购买、消费信息请求和不支持事件须核查。

Google purchaseToken及原通知用独立32字节AES-GCM密钥加密，文件存Base64文本，`dataKeyId`标识写入密钥。轮换时用`dataKeys`保留旧ID到文件的映射，使历史凭据仍可读取；AAD绑定渠道与应用。备份必须同时保留数据库和相应密钥，不能把凭据放在日志、URL或outbox明文中。

实现依据：[Apple官方服务端SDK](https://github.com/apple/app-store-server-library-node)、[Google productsv2验真](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2/getproductpurchasev2)、[Google消费确认](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/consume)、[RTDN通知规则](https://developer.android.com/google/play/billing/rtdn-reference)。真实Apple证书链/OCSP、商店SKU、Google账户权限与RTDN推送均须在实际商店环境验证。

## 全额退款、缺口与对账

管理端使用独立退款权限申请微信/支付宝整单退款。原订单基础与赠分必须全部未消费、未冻结；有未处置的该订单风险时先人工复核。申请、原来源定向冻结、审计与退款任务原子提交，不挪用其他充值批次。已确认但未履约的迟到现金款也可原路退还。内购不提供站内发起退款，交由商店处理。

退款任务使用固定退款编号和原金额重试，申请返回成功不代表已退款。微信签名退款查询明确`SUCCESS`，或支付宝验签查询明确`REFUND_SUCCESS`后，才扣回冻结积分并标记`refunded`。微信明确`CLOSED`才解冻；网络异常、未知状态或处理中均保留冻结，重复成功不再次扣回。普通积分接口不能核销/解冻退款凭证，不能单独冲正充值发放。

微信退款通知入口为`/api/payments/wechat/refund-notify`，原始体验签解密后持久化查单线索，再查询签名结果。Apple/Google验真的整单退款追回原订单剩余可用和冻结积分；混合冻结中其他来源积分保持原样。Google绑定字段缺失时，仅用相同已入账交易补充缺失信息，不能覆盖矛盾绑定。已消费缺口写入风险记录并阻止消费，不产生负余额，也不扣别的充值。部分/未确认全额退款保留权益并限制消费，交人工核查。退款不恢复首单资格、券使用或已核销额度。

对账权限可幂等创建指定订单后台任务，并恢复本订单死信；不抢占有效租约。默认主动查渠道，再校验账户与流水累计/连续性、批次分配回放、冻结凭证与明细、订单发放/退款审计及额度凭证。`verifyChannel=false`仅作站内检查，结果明确记录`channel_not_checked`。网络未知保持待处理，差异保留审计并限制消费，不能直接改余额“修平”。当前提供按订单发起任务，不包含银行结算账单下载、全量定时财务扫描或自动核销缺口。

显式设置`repairProjection=true`可在不可变流水、批次分配和冻结证据全部一致、且差异仅限账户余额/序号投影时执行审计重建。命令有幂等键、操作者和原差异记录；不会修改流水、批次或付款事实。存在来源/额度/订单差异时拒绝重建；已有风险不会自动解除，仍需人工处置。默认只检查，不执行修复。

订单详情和列表的`settlement`返回实际入账基础积分、赠分、活动赠分及关联流水，未入账为`null`。活动赠分已包含在实际赠分中，不能再次相加；订单退款后仍保留原入账事实。运维恢复和开发性能证据见[账务运维与验收](billing-operations.md)。

人工风险处置使用独立`system:billing:risk:resolve`权限，必须记录依据；所有风险解决后才恢复账户操作。处置不会生成虚假支付/退款或补偿积分。历史扣减涉及退款中的或已退款批次时禁止冲正恢复已撤销权益。

实现依据：[微信退款查询](https://pay.wechatpay.cn/doc/v3/merchant/4012791884)、[支付宝退款查询](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/api-list/alipay-trade-fastpay-refund-query.html)。渠道退款、缺口处置和实际商店通知仍须用真实配置完成联调。

## 开发验证

使用[Docker开发环境](../guide/docker.md)，创建独立测试库，不在开发业务库执行并发测试：

```sh
node scripts/docker-dev.mjs exec postgres createdb -U ku_vibe_admin kuvibe_billing_test
node scripts/docker-dev.mjs exec postgres createdb -U ku_vibe_admin kuvibe_billing_test_migration
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/catalog.integration.mjs
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/orders.integration.mjs
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/payments.integration.mjs
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/iap.integration.mjs
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/refunds.integration.mjs
node scripts/docker-dev.mjs exec -e POINTS_TEST_DATABASE=kuvibe_billing_test -e TYPEORM_DATABASE=kuvibe_billing_test backend node --test test/consecutive-recharge.integration.mjs
```

已创建测试库时跳过createdb；按实际`POSTGRES_USER`替换示例用户名。测试保留本次独立业务记录，使用随机业务标识避免跨次互相干扰。覆盖200并发抢每日20份、预算回滚与消费/释放、版本降额保护、券固定权益、内购映射、首单事实保护及迁移往返/旧数据保留/实体diff。并发测试验证一致性，不代表生产吞吐已验收。

历史新增迁移不重写既有用户或积分表；本次独立流水迁移调整SKU索引、关联约束和保护触发器，回填历史平台流水状态。停全部旧API/worker后迁移，再统一启动新代码，锁与恢复说明见接入流程。有新模型数据时拒绝有损down，使用前向修复。Atlas不可用时不能宣称lint通过。

连续状态迁移 `1790770200000` 仅新增表、唯一索引和外键，不重写旧数据；创建外键会短暂锁定引用表。升级时停止全部旧 API/worker，完成迁移后统一启动新版本，避免旧实例写入成功充值却不更新连续投影。有连续状态时拒绝 down；回退应用也应保留新表并停止连续活动，重新启用前核对旧实例期间的成功订单和状态。
