# M4消耗型内购验真与恢复

日期2026-09-30。M4c/M4d代码及独立验证完成，实际商店/客户端联调待配置。

## 交付

- Apple官方SDK服务端查transactionId、在线证书状态/JWS验证，限制消耗型、PURCHASED归属、Bundle/环境/SKU/单件数量和订单UUID；生产必须正整数appAppleId，禁止免验签本地环境。
- Google官方身份SDK获取Android Publisher权限，productsv2按token查单，严验SKU、测试环境、数量与双绑定；token哈希唯一，不依赖orderId。租赁/预订商品拒绝。
- 内购准备一次性返回固定权益及绑定；订单永不过统一15分钟，旧SKU下架后历史有效交易仍履约。仅本人可交凭据，不猜用户归属。
- Apple通知验JWS，Google RTDN验OIDC受众/issuer/email_verified/精确推送账户；持久化通知后异步查商店最新状态，由UUID补单。未知归属、部分退款、多件、消费信息请求等保留review。
- Google token和通知用AES-GCM加密、AAD绑定应用；dataKeys保留旧密钥读取。客户端凭据不出现在日志、URL或outbox明文。
- Google明确pending不入账、不消费、不占首单；正常等待延迟60秒而不耗尽故障重试。入账后Google consume任务可恢复；Apple客户端只有订单paid后可finish。
- 自审补齐首单券在结算时的有效期/归属/次数约束与统一额度锁序，避免条件赠分绕过券次数。

## 验证

- 真PG内购6项通过：Apple/Google同用户并发只中一次首单；站内0限量仍固定权益；pending重复12次无余额/首单/消费；消费失败后已到账权益不回滚且可重试。
- 30重复RTDN补单一次、重复receipt不加积分、跨用户提交拒绝；错SKU/账号/订单/数量不履约，商店取消不占首单；旧套餐下架后原权益履约，无绑定历史交易待审。
- 现金支付10项回归通过，新增10用户共享一次首单券仅1人获赠；Billing Jest3套10项、类型/编译/聚焦lint通过。
- 渠道契约3项通过，新增Google productv2解析/缺少orderId/测试环境/部分退款/pending/缺OIDC；微信支付宝真实RSA签名契约继续通过。外部商店API明确使用契约替身，未宣称有效Apple生产JWS/真实Google购买验收。
- Docker后端重启加载新增路由后健康；真实HTTP内购不预占站内限量、默认503关闭、缺凭据422、公开通知缺认证拒绝、支付宝原文表单解析、积分保持及Swagger通过。HTTP测试套餐已下架；无支付订单作为开发审计记录保留。
- 文档VitePress构建通过。pnpm入口尝试自动重装工作区被无TTY保护中止，未强制清理依赖；使用既有Node工具直接运行检查。
- 本阶段不改变数据库结构，无新迁移、不改已应用迁移，未执行生产部署。

## 后续与版本

继续M5来源定向退款冻结/扣回、风险限制、对账与人工审计，再M6多实例/故障/兼容/运维。真实四渠道配置、App/商店客户端联调仍未完成，不允许开启默认关闭的渠道并宣称可上线。

完整需求版本门禁pending：根/backend实际1.3.0，minor目标1.4.0待M6；KuVibe release/schema/revision保持，阶段保存不重复递增。用户授权Git提交，无push/tag/release。
