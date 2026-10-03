# 套餐选择与内购商品维护补充

时间：2026-10-03，Asia/Shanghai；变更集 `billing-catalog-ui-20261003`。

用户要求活动适用套餐改为下拉选择，以及在充值套餐中维护对应的 iOS 内购和 Google Play 商品 ID。

## 实现与验收计划

- 只修改 Playground billing 业务页面和表单，不改 Vben 框架、登录、其他系统模块或支付结算规则。
- 活动从管理套餐 API 分页读取全部当前套餐（含草稿/下架），按名称、标识和稳定 ID 搜索、多选；新建/编辑共用，空数组仍表示普通活动全套餐，连续充值必须选择。失败显示错误并允许再次点击重试，历史缺失选择显式保留。
- 套餐已有不可变 `biz_channel_product` 映射；明确 iOS / Google Play 入口及两家商店添加按钮，应用 ID/环境/Product ID 可维护，所选套餐版本自动绑定，移除手填版本 ID。继续保护旧 SKU 权益，重复商品 ID 改绑由现有后端拒绝，不增加覆写/删除入口。
- 验证表单大整数/必选/空数组、分页/失败重试/回显、两家商店默认值与所选版本提交；前端类型及生产构建、真实浏览器和本地 Docker 健康检查。
- 现有用户商品查询仅支持当前销售中的已上架套餐。用户最终明确列表与详情应分开：管理 `/system/billing/packages` 保持分页列表，新增 `/system/billing/packages/:id` 单套餐详情及当前版本映射，支持草稿/下架，仍需 catalog:read 权限。撤去未交付的 includeProducts/packageId 查询参数方案；保留用户查询限制，同步 Swagger/生成客户端。更新 docs/frontend/billing.md；持久化/迁移/架构 N/A。原四渠道真实联调和生产容量门槛继续 pending。

## 版本决策

读取当前权威清单及 CHANGELOG，其他独立需求已将根/backend 推进至 2.0.1（字典重构和运维文档），不再采用旧 active 的 1.3.0 快照覆盖当前版本。初始两项 UI 纠正评估 patch；因补充支持草稿/下架套餐的管理详情 API，最终最高语义/有效影响 minor，可独立验收；原始基线均 2.0.1，最终目标均 2.1.0，验证后已一次性同步两份清单及 CHANGELOG；原 patch 目标未执行，不重复递增。锁文件无本应用自身 version 元数据或受影响内部依赖，N/A。前端上游版本与 KuVibe 0.3.3/schema2/revision 保持。

## 完成证据与审查

时间：2026-10-03T11:29:00+08:00。

- 后端聚焦 Jest 2套13项通过（新增详情6项），tsc tsconfig.spec.json、局部 ESLint 和 Nest build 通过。覆盖草稿/下架/已上架、当前版本映射、大整数、不存在、非法ID及权限声明。
- 前端全部业务 Vitest 9套28项通过；最终测试替身规范修正后聚焦2套9项复验通过。vue-tsc、7个业务文件局部 ESLint（0错误/0警告）、生成客户端同步后的生产构建通过。宿主 pnpm 自动切换11.16.0时网络签名获取失败，采用固定镜像内工具链完成，未改变安全策略。
- VitePress 文档构建及 git diff --check 通过。Swagger实际导出详情操作及必填products数组，前端客户端从同一实际契约生成，补齐此前未完整生成的账务/任务类型与调用；本地默认URL反映17001，业务runtime仍按配置覆盖。
- Browser真实组件隔离页面验证已选套餐回显、yearly标识搜索、双选提交string[]（9007199254740993保持精度）、清空连续活动阻止提交、iOS/Google默认商店及无需版本ID；隔离页面console error为0。提交只显示结果，不写数据库。
- 已部署真实管理页面验证新建活动下拉与既有Vben菜单/弹窗；开发库套餐数为0，因此已存在套餐的真实HTTP详情读取未执行，有数据路径由后端单元与页面替身测试覆盖；未创建样例套餐或映射。只读HTTP管理员列表200、无令牌详情401、缺失详情404、非法ID按本项目规范422通过。实际浏览器历史有一条部署前令牌刷新失败，更新后管理页与套餐加载成功，无新增错误。截图位于本地忽略路径.tmp/catalog-activity-select.png。
- 同一kuvibe-admin-dev snapshot配置重建backend/frontend，仅up --no-deps更新两端，无迁移/setup，无持久卷变更。五项服务healthy，实际后端2.1.0；临时kuvibe-catalog-verify已清理，隔离验收页面随前端重建移除。访问http://localhost:5999。
- 审查确认列表仍分页、不附带商品明细；单套餐详情使用catalog:read，用户商品查询销售条件和旧SKU保护保留。映射自动绑定详情读取到的版本，金额/积分/ID精度保持。未改Vben框架、登录、无关业务或依赖，未全仓格式化或输出凭据。

## 版本与后续

语义/有效影响minor，结果bumped：根package.json及backend/package.json均2.0.1 → 2.1.0，因为新增兼容单套餐详情能力。统一递增一次，CHANGELOG已同步；锁文件无产品自身version/内部依赖变更，N/A。前端上游版本、KuVibe release/schema/revision不变。未执行Git提交、标签或远程发布。

本次UI与详情追加范围完成并独立归档。原points-recharge-orders四渠道真实联调、生产容量门槛继续pending，不宣称整个支付需求验收完成。
