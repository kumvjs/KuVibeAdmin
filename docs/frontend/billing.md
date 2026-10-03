# 积分与充值前端

本仓库的实际接入入口为 `packages/frontend/playground`，沿用 Vue/Vben、Antdv Next、原有登录与管理布局。它连接真实 NestJS 接口，关闭 Nitro mock；其他演示应用不随本次改动切换。

## 开发环境

先按 [Docker 开发环境](../guide/docker.md#源码热更新开发环境)完成后端迁移及交互 `setup`，再在仓库根运行：

```bash
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml build frontend
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml up -d --wait frontend
```

打开 `http://localhost:5999` 或 `http://127.0.0.1:5999`，使用自己通过 `setup` 创建的管理员账户。登录页保留 Vben 原有表单与交互；界面的示例账号/密码不代表后端已创建对应账户，需填写实际账户并完成原页面验证。前端服务以普通 `node` 用户运行，依赖保留在 Linux 镜像中；源码、Vite 配置和应用测试目录只读挂载，轮询监听适配 Windows。新增依赖时重新构建镜像，日常修改源码自动刷新。

此前端开发覆盖文件在已有 `APP_CORS_ORIGINS` 基础上补齐上述两个精确来源，避免仅允许 localhost 时访问 127.0.0.1 报“请求来源不受信任”。配置更改须执行上面的 `up -d --wait` 重建应用容器；只执行 `restart` 不会更新环境变量。生产仍须显式配置 HTTPS 来源，不使用此开发覆盖文件。

Docker 的 `/api` 代理访问 `http://backend:7001`；宿主运行时默认代理 `http://127.0.0.1:17001`。宿主开发须先在 `packages/frontend` 冻结安装其独立锁文件，复制 `playground/.env.example` 为 `playground/.env`，再执行 `pnpm dev:play`。后端使用自己的锁文件，不能混用宿主与容器依赖。

首次构建从官方 npm registry 下载，BuildKit 缓存保留下载内容；特殊网络环境可通过构建参数 `NPM_REGISTRY` 指定源，不修改锁文件。真实密钥和本地 `.env` 不进入镜像，示例配置仅含公开的 Vite 设置。

已有数据库升级后运行交互 `setup` 补齐菜单。初始化将四个旧只读按钮原地升级为管理页面，并将旧版挂在“系统管理”下的“积分管理”“充值运营”移为顶级目录，保留 ID、自定义元数据和角色关联；发现其他冲突仍拒绝覆盖。本人页面由应用提供给所有已登录用户，不需要授予任何系统管理权限。

## 页面与权限

后台“积分管理”“充值运营”与“系统管理”平级：前者包含账户与流水，后者包含套餐、活动和订单账务。页面地址仍使用已有的 `/system/points/*`、`/system/billing/*`，保留原有链接和权限码；菜单层级由后端数据决定，无需修改 Vben 通用布局或路由实现。

| 页面 | 功能与边界 |
| --- | --- |
| `/account/points` 我的积分 | 可用/冻结余额、受限状态、不可变流水、游标加载；顶栏余额及充值快捷入口 |
| `/account/recharge` 充值中心 | 已发布套餐、限量和用户限购、微信/支付宝、券码、服务端报价确认与扫码入口 |
| `/account/orders` 历史订单 | 本人订单分页、权益快照与实际结算、继续查询/付款、取消待付款订单 |
| `/system/points/accounts` 积分管理 | 按用户查询账户与流水；增加、扣减、冻结、核销、解冻、冲正分别对应独立权限 |
| `/system/billing/packages` 充值套餐 | 创建、版本修改、上架/下架、四渠道总/日/用户限量、销售窗口、Apple/Google SKU 映射 |
| `/system/billing/payments` 平台支付流水 | 平台事实、未关联付款、原始币种金额、重新验真与审计人工关联 |
| `/system/billing/promotions` 优惠活动与券 | 首单、每日首单、连续充值赠送、满额优惠、折扣、赠分、预算、渠道和套餐范围、发券与定向用户 |
| `/system/billing/orders` 订单与账务 | 按用户/渠道/状态/商户号筛选；全额退款、对账、差异报告与独立权限的风险处置 |

管理菜单来自后端角色授权，按钮检查对应权限码，接口仍独立鉴权。用户列表新增“积分账户”入口，携带字符串用户 ID。本人接口从 JWT 获取用户，不能通过查询参数查询他人账务。积分“删除”通过扣减或冲正完成，不提供删除流水或手工标记支付成功入口。

新建和编辑活动的“适用套餐”为可搜索的下拉多选，显示套餐名称、标识、ID 和状态，包含草稿与下架套餐；编辑时回显已有选择。普通活动留空适用全部套餐，连续充值赠送必须至少选择一个套餐。

新增优惠时选择“连续充值赠送”，选择适用套餐，填写最大天数和每一天赠送积分，赠送频率默认“每天首笔赠送”，也可选“每单都赠送”。各套餐独立按北京时间成功充值日累计；同日不增加天数，中断后重来，超过上限持续按最后一天额度赠送。连续活动只赠送积分，实付保持套餐设定金额。充值确认展示本次预计连续天数，实际以成功入账重新判定；规则见[连续充值赠送](../modules/recharge.md#连续充值赠送)。

充值套餐每行的“iOS / Google Play”打开当前套餐版本的商品映射，草稿和下架套餐也可配置。在详情中点击“添加 iOS 内购商品”或“添加 Google Play 商品”，填写对应商店的 Product ID、应用 ID（iOS Bundle ID / Android Package Name）及沙箱/生产环境，提交自动绑定所选套餐版本，无需手填版本 ID。旧映射不可覆盖；新套餐版本可复用同一商品 ID，但站内标价和基础积分须一致，赠分可不同。

管理列表 `GET /system/billing/packages` 继续分页查询全部状态的套餐；管理详情 `GET /system/billing/packages/:id` 返回单套餐当前版本及商品映射，沿用 `system:billing:catalog:read` 权限。用户端商品查询仍仅提供当前已上架且处于销售期的版本。详细契约以 Swagger/OpenAPI 为准。

## 付款与重试

原生 App 和网页从获取套餐、创建订单、准备支付到客户端结果、服务端回调的接入顺序见[充值接入流程](../modules/recharge-payment-flow.md)。

创建订单前重新确认服务端报价及版本。预计赠分包含保底赠分，两者不重复相加；历史订单显示不可变入账证据，退款后不会把历史发放量当作当前余额。所有账务 ID、金额、积分和额度均保持字符串，金额通过 `BigInt` 转换元/分，不使用浮点计算。

微信/支付宝网页只请求扫码支付。二维码由后端返回；自动查询每 3 秒一次，约 60 秒暂停，手动刷新仍操作原订单。查询报错、页面关闭和渠道未知均不代表支付成功；积分到账只以服务端订单结果为准。取消已发起的支付可能进入“关闭确认中”，库存释放由服务端确认后执行。

请求未得到明确成功响应时，相同用户、内容与操作复用保存在 `sessionStorage` 的幂等键，存储不含令牌或支付凭据。明确创建订单后保存返回的订单 ID，付款继续查该订单；服务端继续保证同用户待付现金订单互斥。提交期间禁止重复操作，报错保留表单与原订单供查询。跨页可从历史订单恢复。

Apple/Google 在网页提供固定商品映射和历史权益展示，付款与恢复交易需要对应原生 App；网页不发起商店购买，不伪造商店现金优惠。首单按成功充值入账判定，退款不恢复资格；每日限量按北京时间，输入销售/活动时间按设备当地时间转为 UTC。

平台流水查看、重新验真、人工关联分别使用 `system:billing:payment:read/recheck/bind`。未关联付款不自动创建业务订单或发分，未知金额明确展示。人工操作必须填写依据，关联后仍由后台验真。新建现金和内购订单统一30分钟预占，现金确认渠道关单后释放，内购释放后迟到款交客服核查。完整参数和金额单位见[充值接入流程](../modules/recharge-payment-flow.md)。

四渠道配置默认关闭。未配置渠道返回明确错误，页面保留订单供查询或取消。真实扫码、商店购买、退款及真实通知仍需商户/商店配置联调；开发环境页面验收不等于渠道上线验收。后端边界见 [充值业务](../modules/recharge.md)和 [账务运维](../modules/billing-operations.md)。

## 验证命令

```bash
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml exec frontend pnpm typecheck
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml exec --workdir /workspace/frontend frontend pnpm exec vitest run --config playground/tests/vitest.config.ts
node scripts/docker-dev.mjs -f compose.dev.frontend.yaml exec frontend pnpm build
```

`playground/tests/vitest.config.ts` 是项目应用的测试入口，继承 Vben 根目录已有 `vitest.config.ts`，补充应用 `#` 别名并限定 `playground/tests` 的用例；测试覆盖金额/积分精度、幂等重试、付款轮询和真实认证适配，不参与应用运行。没有增加测试依赖，也不修改 Vben 通用测试配置。前端上游修改边界见仓库 [Agent 规范](https://github.com/kumvjs/KuVibeAdmin/blob/main/AGENTS.md#vben-上游维护边界)。

生产构建使用同源 `/api`，部署时须由 HTTPS 反向代理转发到后端并沿用其安全 Cookie/CORS 配置。开发 Vite 代理和 Docker 热更新服务不代替生产静态站点部署。
