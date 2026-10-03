# 共享内购商品、独立支付流水与平台金额

时间：2026-10-03T13:08:59+08:00；变更集 `iap-payment-records`，原始基线根/backend 2.1.0。用户批准正常购买先建业务订单/支付意图，回调无法关联只存支付流水；内购预占30分钟，后续明确现金也30分钟。用户要求按各平台官方协议核对标识和金额，并建议Apple官方服务端SDK。

## 决策与实现

- 复用业务订单、`biz_payment_attempt`、通知inbox、结算/退款和outbox，不另建intent表。禁止从productId+金额猜套餐/用户或回调自动创建业务订单。同商店/应用/环境/SKU可被多个套餐版本引用，标价和基础积分须一致，赠分可不同；旧映射、快照和ID保留。
- `biz_payment_transaction.order_id`可空，首次事实与身份不变，新增最新验真事实、匹配/履约状态、验真时间和人工依据。平台交易键唯一，已有关联不可改绑、已履约奖励不可修改；退款不能被旧成功通知逆转。可信交易即使缺绑定、PENDING或退款也独立落库，不发分/占首单。查询DTO不返回原收据/token/绑定标识。
- Apple每单UUID appAccountToken；无UUID不等于不真实。沿用已安装`@apple/app-store-server-library`3.1.0，ReceiptUtility从旧receipt提取交易ID后另查商店/JWS验签，不保存生产收据；uni-app username透传仍须核实插件，客户端status0不作为发分依据。
- Google新意图只传稳定不透明账号obfuscatedAccountId，资料字段不能当官方订单备注；客户端补报原业务订单和purchaseToken。RTDN先落未匹配流水，不能凭账号/SKU猜单；同用户/应用/环境/SKU有效期内仅一笔待付意图，核对购买完成时间。旧profile UUID意图保持原校验/自动定位，已实测兼容。
- 微信/支付宝merchantNo为32位十六进制字符串，兼容各自out_trade_no规则。现金金额范围预占前校验，微信CNY整数分、支付宝BigInt转换两位元字符串。Apple验签price保留milliunits/scale3；Google SDK micros只展示，productsV2无实付，Orders API核对订单/token/SKU后读Money total并保留scale9。金额未知为null并持久补查，不填套餐价，不经Number。
- 四渠道预占4类套餐额度。新现金/IAP均30分钟；现金须确认渠道关单，网络未知不释放；IAP到期释放，结算锁内也检查期限，worker延迟不能绕过。到期后处理付款留核查、不自动履约。旧到期时间不改写、旧null内购保留历史契约。
- 后台“平台支付流水”read/recheck/bind权限独立，操作必填操作者和依据。人工关联仅允许无矛盾归属的单件已验真交易与有效未入账订单，另行验真才履约；已释放旧单、已有交易不可改绑，现金仍走订单对账。Google入账后消费，自动未关联/PENDING恢复最多三天，平台自动退款继续同步，不能承诺无限保留扣款。

## 验证与审查

- 后端50套315单元通过，tsc/Nest build/局部ESLint通过。最终缺失资源错误响应及现金错误恢复入口修正后，18项支付/IAP回归复验，真实HTTP缺失流水404通过。
- 本次独立PostgreSQL18.6容器：新流水10项与旧账务46项通过，包括共享SKU、24并发额度、200人抢20份、100并发结算/退款、事务失败回滚、连续/首单、无绑定不建单、人工关联、迟到款、Google旧意图与退款乱序。两种旧流水状态up/down/up保留原事实，新模型使用后拒绝有损down，实体diff0。契约替身不代表真实商店验证。
- 前端5套21项通过，vue-tsc/业务ESLint/生产构建通过。金额纳单位、大整数ID、核查依据、权限及已关联不可改绑有测试；从最终实际Swagger生成客户端后类型/构建复验。Vben共享框架、登录和上游基线无本需求改动。
- VitePress最终构建、git diff --check通过。Atlas完整历史基线+候选SQL hash/validate通过；清理pg_dump客户端元命令、使用实际public搜索路径。lint需要Pro登录，未执行、未登录/上传/购买；按Atlas Skill继续SQL审查和真实PG验证，不声称lint通过。

## 本地Docker交付

- 沿用`kuvibe-admin-dev`和dev/frontend/snapshot覆盖及原数据卷。停API/worker/前端后备份数据库、附件/公开文件/billing密钥卷；忽略目录`.tmp/docker-deploy-20261003-3.0.0`保留database.dump/files.tar.gz，权限600，gzip完整性通过。
- 实际备份恢复到隔离库，43张旧表原列指纹在up/down/up一致；唯一待迁移DecoupleIapPaymentRecords1790992800000、diff0。实际开发库应用后diff0、原1笔订单保留，未创建样例套餐或真实支付。
- 构建替换标签后旧后端image ID已不可tag；准确旧src/dist/test/2.1.0清单与原相同依赖镜像组成`kuvibe-admin-backend:pre-3.0.0`恢复镜像，不复制运行时密钥环境；旧前端`kuvibe-admin-frontend:pre-3.0.0`保留。新模型使用后不能只降级代码，优先保留结构前向修复；旧结构恢复须停写并恢复一致备份和匹配密钥。
- 实际backend3.0.0，initializeBaseData/clearSetupPermissions仅同步菜单和权限缓存，不重置管理员。backend/frontend/PostgreSQL/Redis/RabbitMQ五项healthy，入口http://localhost:5999。
- HTTP管理员流水200、匿名401、非法筛选/缺理由/非法补报422、缺失流水404；Swagger有金额DTO/恢复接口。Browser验证已登录菜单、筛选控件、表格与查询空结果，无页面错误提示。开发库无平台流水，实际金额行/关联操作由页面测试与隔离服务测试覆盖。
- 临时验证容器清理，保留忽略备份/SQL证据。生产未部署；未查询或兑现用户提供的真实生产Apple收据。

## 文档、版本和后续

当前事实更新docs/modules/recharge-payment-flow.md、recharge.md、billing-operations.md、docs/frontend/billing.md及VitePress导航/Swagger/生成客户端。原points-recharge-orders真实四渠道联调和生产容量门槛仍active；本追加范围独立完成，不宣称生产支付验收完成。

语义/有效影响major，bumped：根package.json与backend/package.json均2.1.0→3.0.0，原因是原忽略内购额度开始执行、30分钟履约门槛及新Google参数契约。统一递增一次，CHANGELOG同步；锁文件无产品自身版本或内部版本依赖，N/A。Vben5.7.0/5.8.0及KuVibe0.3.3/schema2/revision不变，未Git提交、标签或远程发布。
