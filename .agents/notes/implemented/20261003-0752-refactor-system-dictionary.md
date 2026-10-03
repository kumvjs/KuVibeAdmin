# 系统字典完全重构交付

时间：2026-10-03T07:51:56+08:00（Asia/Shanghai）。需求标识：system-dictionary-refactor-20261003。

## 问题与授权

用户提供单表邻接树、懒加载及简单 Cache-Aside 的完整重构方案，明确修正为保留管理员全量接口；随后确认“按附件和修正完成整个字典模块重构”。初版 system-dictionary-20260930 与已实施 1.4.0 的一级整树 revision 缓存作为历史保留，新目标替代旧架构。

## 决策与实施

- 管理 /system/dict/list 保留完整 flat/tree，必须有 system:dict:list。业务只开放登录后的 /dict/:id/children、/dict/:id/descendants，强制有效状态过滤，无全量/batch/rootCode。
- 管理根初始化、直接下级箭头展开、10px蓝色小号v标志、节点编辑与可搜索树形父级下拉、独立启停；搜索和父级选项是按需调用完整管理集合的明确操作。只修改 Playground 自有字典/API/生成客户端/验收夹具，Vben共享、登录、布局和构建基础无差异。
- 保持 sys_dict、旧ID/父级/审计/软删除数据，新增 cache_enabled boolean default false。移除旧 dict-cache.service/keys/types/spec、dict-tree 及范围裁剪/版本树/Lua兼容实现，使用小型格式输出帮助函数。
- code 创建后不可修改；已有非null value（包括空字符串）通过停用并新建替代。无可信业务引用登记，取消删除API，避免误删已使用配置；保留历史软删除数据和既有菜单记录，旧delete权限不再对应路由。启停新增 system:dict:disable，setup不给普通user管理权限。
- 查询不保存/返回物化路径。children 下级部分为 pid 索引 + EXISTS；为保留原业务“祖先停用则不可用”规则，在同一数据SQL中只递归锚点祖先，不递归其下级、兄弟或一级整树。这是对附件“children不用递归”的精确边界解释，不牺牲祖先状态正确性。
- descendants 仅查询指定范围，MAX_DEPTH32、MAX_RESULT_NODES10000（含锚点安全集合），超限拒绝截断；读写事务statement_timeout3秒。业务每实例每用户120次/分钟，窗口表最多10000用户，跨实例整体限流留给网关。
- 写入 READ COMMITTED + pg_advisory_xact_lock；校验旧/新父链和移动子树高度。提交后直接DEL admin:list、旧新祖先/父级业务键；移动/启停清理子树锚点键，不检查缓存存在、不主动重建。
- 管理简单缓存 sys:dict:{1}:admin:list；热点业务显式 cached children/descendants且开关true才回填。MISS一条数据SQL含anchor开关，HIT零SQL；缓存固定enabled集合、descendants含锚点，format/includeSelf在内存投影。TTL60秒+jitter0–9秒。
- CacheService 保持现有调用默认行为，增加可选回填判定、guardFill及best-effort读取/失效：标准加载锁所有权Lua检查，DEL同时移除锁，旧loader不回填。200ms短超时/1秒熔断/DB降级；失效失败告警，恢复后陈旧值至多由60–69秒TTL回收，不声称跨Redis/DB强一致。

## 迁移与部署影响

使用项目 Atlas Skill。1790983591215-dict-cache-enabled.ts 由 pnpm migration:generate 在本次独立 PostgreSQL18.6 重放基线后生成，仅新增列，未重写既有字段。补充down锁表和true配置拒绝丢弃保护；全部false时可往返。Atlas CLI未安装，Pro lint未运行，不伪称上线就绪。

带旧数据up/down/up、主键/值/父关系/tenant/审计微秒/软删除保持，实体schema diff为空。有true配置拒绝down。ADD列仍需ACCESS EXCLUSIVE锁，生产锁等待/备份恢复需独立演练；本次没有日常或生产 migration:run/setup/deploy。

升级需迁移、部署匹配前后端、setup补齐启停权限并授权需要的管理角色、清理权限缓存/重新登录；按前缀清理历史字典 index/tree 键。rootId/rootCode列表筛选、路径响应、删除API、编码/已设值编辑及超过32层的契约不再支持，调用方迁移到指定ID读取。

## 验证与验收

- 后端全量Jest：48套/306项通过；tsconfig.spec类型检查、nest build与所有改动后端文件ESLint通过。
- 真实独立PostgreSQL18.6 + Redis8 DB15：14项新模型集成通过；迁移数据往返/结构diff、children/descendants/hasChildren/value/bigint、管理权限边界、独立启停、并发移动/重复写、缓存MISS/HIT/开关/失效/旧loader、故障降级、限量/深度及setup。
- 1000节点样本：roots/children/descendants/cached MISS/HIT的数据SQL数=1/1/1/1/0，重复缓存读取冷启动命中1/2；响应297787字节；JSON序列化约2.6ms，HIT约14ms。样本受同时构建资源影响，非生产SLA或容量结论。
- 前端2项应用Vitest、vue-tsc、生产Vite构建、字典局部ESLint通过；生成客户端仅保留字典相关差异，其他生成能力未混入范围。
- Browser Skill验收独立UI夹具：初始化roots，无list；展开1/2只请求children；非叶子/空字符串小号v标志；编码/已有值禁改、名称/cacheEnabled提交、全局搜索显式list、status独立请求。夹具不访问日常数据库，真实HTTP/Redis行为由后端集成覆盖。
- 用户追加体验修正：Value标志由大Tag改为10px蓝色v，父节点使用14px箭头和24px点击区，保留加载及无障碍状态；上级节点改为TreeSelect，按名称/编码搜索、层级展开、排除自身/后代/异常循环，ID保持bigint字符串。复用项目getPopupContainer将弹层挂载表单，修复Vben窗口遮挡；Browser检查可见弹层、编码搜索及深层节点选择，保存独立夹具截图。前端2项测试、局部ESLint、vue-tsc及生产构建再次通过。
- VitePress构建、git diff --check、旧代码/DTO/key引用搜索、Vben上游差异检查通过。

## 文档、记录及版本

当前规则写入 docs/modules/dictionary.md；公共契约在Swagger与字典生成客户端。test:dict:integration为现有脚本的正式入口；UI夹具用途、运行位置、隔离性质和Playground维护归属已说明，不参与产品运行。初版计划及本轮重构计划完成范围合并到本笔记，移除system-dictionary active目录；其他active及历史implemented笔记保留。

版本权威：根package.json/backend package.json，统一基线1.4.0 → 2.0.0；语义/有效影响major，结果bumped。理由为已批准完整重构中的不兼容接口、路径、生命周期和深度约束，单次完成需求递增；本轮追加UI修正属于同一需求，不再次递增；CHANGELOG同步。无内部依赖引用此私有产品版本，两个pnpm锁的importer不记录根/应用版本，锁无需改写。KuVibe0.3.3/schema2维护有效，schema/revision不变；Vben5.7.0/Playground5.8.0独立上游版本不变。未提交Git、打标签或发布。

未验证：Atlas CLI/Pro lint、生产规模并发/锁预算/零停机和生产恢复演练。清理本次隔离测试容器，不改变现有开发服务。
