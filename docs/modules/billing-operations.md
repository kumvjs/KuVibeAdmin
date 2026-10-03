# 账务运维与开发验收

积分、套餐、订单与渠道规则见[充值模块](recharge.md)，公共契约以Swagger为准；团队操作入口沿用[快速开始](../guide/getting-started.md#团队统一使用方式)。Vben playground 的管理与用户页面见[积分与充值前端](../frontend/billing.md)，原生客户端支付 SDK 仍由外部工程接入。

## 启用前检查

当前四渠道默认关闭。微信/支付宝需要原商户、应用、环境、可信签名密钥及真实App/扫码联调；Apple需要服务端凭据、根证书、SKU、客户端绑定及真实证书链/OCSP验证；Google需要应用权限、SKU、服务账户、Pub/Sub OIDC与RTDN联调。各渠道完成验真、重复交易、退款与网络故障联调后再启用相应配置。契约替身和本地RSA测试不等于商户/商店联调。

备份数据库、附件及全部仍在使用的数据加密密钥；保留旧密钥ID映射和旧镜像。迁移需先按Atlas Skill审查并在生产规模副本演练锁预算，停止旧实例写入后迁移，再启动新代码。新增业务表已有账务/退款/对账数据时拒绝down，采用前向修复，不删历史重跑。恢复时先保持渠道关闭，确认账务、密钥、通知与任务完整再开启worker。

## 日常观察与恢复

账务 outbox 由后台 `billing.outbox` 定时任务投递到 RabbitMQ，消费结果仍由数据库租约和状态保护。订单到期、支付准备/查询/通知/关单、Google 消费、退款和对账复用已有处理器。日常使用“系统管理 → 任务调度”查看触发日志；业务积压和死信仍需结合以下 outbox 诊断。RabbitMQ 管理界面可观察 ready/unacked/consumer，恢复与开关说明见[任务调度](task-scheduling.md)。

以下SQL仅作只读诊断，使用已有数据库管理连接执行：

```sql
SELECT type,status,COUNT(*) AS count,MIN(available_at) AS oldest_due,
       MAX(attempts) AS max_attempts
FROM biz_billing_outbox
WHERE tenant_id=1 AND status<>'done'
GROUP BY type,status ORDER BY type,status;

SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest_order
FROM biz_recharge_order WHERE tenant_id=1
  AND status IN ('closing','refund_pending','review')
GROUP BY status;

SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest_inbox
FROM biz_payment_inbox WHERE tenant_id=1 AND status<>'done'
GROUP BY status;

SELECT channel,status,COUNT(*) AS count,MIN(created_at) AS oldest_payment
FROM biz_payment_transaction WHERE tenant_id=1 AND status<>'fulfilled'
GROUP BY channel,status;

SELECT type,COUNT(*) AS count,SUM(gap_points) AS gap_points
FROM biz_billing_risk WHERE tenant_id=1 AND status='open'
GROUP BY type;
```

关注最老到期任务、处理租约、失败计数、长期关单/退款、待审通知和消费缺口。网络失败按原业务键重试；明确pending按正常等待延迟，不耗尽失败次数。租约过期后会重领，旧worker不能确认新租约。

先确认原商户/应用和密钥可用，再按订单发起对账任务恢复其死信；有效租约保持原样。查单未知不能释放库存或退款冻结。孤儿通知和矛盾交易需核对原购买绑定，不能猜测账号或直接标记paid。已关闭订单的迟到现金款可全额退还，不使用已释放额度继续发放。

独立平台流水与业务订单可暂时无关联。后台“平台支付流水”支持未关联/待核查筛选、原始币种精度金额、内购重新验真和有权限的人工关联；必须填写依据，且只能关联有效未入账订单，不能改绑已有交易或绕过释放名额。现金流水继续用业务订单对账入口。Google未知实付由`payment_amount`补查；自动未关联恢复最多三天，不能在Google未确认自动退款后承诺扣款仍保留。四渠道30分钟期限及异常处置见[充值接入流程](recharge-payment-flow.md)。

对账发现差异会保留报告并限制消费。仅在证据完整且差异属于账户投影时显式申请审计重建；来源、交易和额度异常先保留数据并核查，不使用无凭据SQL改余额/删流水。风险记录单独审计处置，全部风险解决才解除限制。已经消费的外部退款缺口需人工决定追缴或核销；系统不会挪用其他充值积分或自动核销。

Apple正常购买须在服务端已验真入账后finish；若交易已验真退款/取消，客户端按已确认终态结束恢复流程，不能显示充值成功。Google由服务端入账后消费确认，消费失败仅补确认、不重复发分。客户端断网应保留原订单/凭据和绑定参数。

## 可复用的Docker验证

日常开发服务与独立验收库互相隔离。先启动[Docker开发环境](../guide/docker.md)，再执行：

```sh
# Linux容器内执行数据库配置、时区、上传和真实应用/认证兼容回归。
node scripts/docker-dev.mjs exec backend node test/docker-regression.mjs

# 新建/重放独立kuvibe_billing_scale库，保留既有测试记录。
node scripts/docker-dev.mjs exec backend node test/docker-regression.mjs scale-init
node scripts/docker-dev.mjs -f compose.dev.scale.yaml --profile billing-scale up -d --wait billing-api-1 billing-api-2 billing-worker
node scripts/docker-dev.mjs exec backend node test/docker-regression.mjs scale

# 只停止并移除额外验收容器，不删除数据库或数据卷。
node scripts/docker-dev.mjs -f compose.dev.scale.yaml --profile billing-scale stop billing-api-1 billing-api-2 billing-worker
node scripts/docker-dev.mjs -f compose.dev.scale.yaml --profile billing-scale rm -f billing-api-1 billing-api-2 billing-worker
```

额外API使用回环17002/17003，只有独立worker启用任务；三者均连接`kuvibe_billing_scale`和Redis DB5，支付配置强制为空。测试通过真实登录和HTTP请求验证权限、抢限量、幂等与到期释放，保留本次账务审计；仅清理自身注入的触发器/临时schema，不删除日常开发数据。Linux回归入口在进程内建立回环代理，保留既有测试脚本的数据库白名单；没有把远端或生产目标加入白名单。

## 2026-09-30开发基线

宿主AMD Ryzen 5 5500X3D，6核12线程；Docker 12 CPU、约11.68GiB。Node 24.21、PostgreSQL 18.6、Redis 8；两个Nest watch API、一个worker，TypeORM各使用默认10连接，真实数据库/Redis，支付配置关闭。数据为约200个本次新用户及有限流水，未采用1万用户/100万流水生产样本。

通过Docker回环代理重复验证的结果：

| 场景 | HTTP结果 | 唯一业务写入 | 成功响应TPS | p95 / p99 ms |
| --- | --- | --- | --- | --- |
| 200人抢每日10份 | 10个200，190个409 | 10订单 | 10.51 | 910.63 / 914.60 |
| 100次同键下单 | 100个200 | 1订单 | 267.15 | 359.46 / 370.63 |
| 200次同账户扣减100积分 | 100个200，100个409 | 100扣减 | 98.20 | 976.71 / 994.14 |
| 100次同键增分 | 100个200 | 1流水 | 276.01 | 334.59 / 346.40 |
| 200次读取余额/流水 | 200个200 | 0 | 706.48 | 265.01 / 270.45 |

正确性违规0，本轮无5xx；拒绝和幂等重放不计作新增业务吞吐。宿主访问回环端口的另一轮结果也通过，延迟略有差别。热点写入仍需按账户/额度串行以保证一致性；数据池、锁等待与应用日志开销需在生产规模负载中继续定位。当前p95未达到初始查询200ms/写入500ms目标，尚未执行15分钟1000RPS混合负载和生产规模迁移锁演练，不构成生产容量承诺。

数据库一致性覆盖积分6项、套餐5项、订单8项、支付10项、内购7项及退款/对账测试；Docker Linux完整Jest 47套298项通过。迁移覆盖空表往返、旧数据保留、非空禁止回滚和实体零差异；Atlas CLI缺失，未运行Atlas lint。全仓lint有21个历史文件的299项错误，本需求涉及文件未发现lint错误；保留基线问题，不能宣称全仓lint通过。
