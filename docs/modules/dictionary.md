# 系统字典

字典使用 `sys_dict` 单表邻接树：根节点是模块目录，任何节点都可有子节点和可选业务值。`pid=null` 表示根，`value=null` 表示未设置值，空字符串、`"0"` 都是有效业务值。不存在 module/category/type/item 独立表或 node_type。

## 管理与业务边界

后台使用 `/system/dict`，完整列表必须具备 `system:dict:list`；仅登录不能访问。普通业务只使用指定 ID 的 `/dict/:id/children` 和 `/dict/:id/descendants`，要求登录，固定只返回自身及祖先均启用的有效分支。普通业务没有全量、根列表、编码定位或 batch API，也不得依赖管理全量接口。以下路径不含默认 `/api` 前缀，完整契约以 Swagger/OpenAPI 为准。

| 接口 | 用途 | 权限 | 缓存 |
| --- | --- | --- | --- |
| `/system/dict/list` | 管理完整树/节点集合、全局搜索、完整管理操作；format=tree/flat | `system:dict:list` | 独立简单整体缓存 |
| `/system/dict/roots` | 管理页初始化根节点 | `system:dict:list` | DB |
| `/system/dict/:id/children` | 管理逐层加载直接下级 | `system:dict:list` | DB |
| `/system/dict/:id/descendants` | 管理指定范围全部下级 | `system:dict:list` | DB |
| `/system/dict/:id` | 管理节点详情 | `system:dict:list` | DB |
| `/dict/:id/children` | 业务有效直接下级 | 登录 | 锚点开关控制 |
| `/dict/:id/descendants` | 业务有效全部下级 | 登录 | 锚点开关控制 |
| batch | 暂不实现 | — | — |

管理页复用 Playground 表格、表单和 Vben 布局。默认只查询 roots，点击父节点箭头展开时获取 children；搜索才获取全量管理集合。上级节点使用树形下拉，支持按名称/编码搜索，展示层级并排除自身及后代；可以选择“根节点（无上级）”。父级选择是明确的管理操作，可以读取完整集合。值标志为轻量小号蓝色 `v`，通过 `value !== null` 判断，带值的节点仍可展开和新增下级。修改后刷新根列表，避免已加载节点残留旧关系。

## 写入规则

- 编码全局唯一，小写字母开头，可含数字、点、下划线和短横线，最长100字符，创建后不可修改。
- 名称最长100字符，同级唯一，可修改；排序为非负整数，同级按排序、bigint ID 排列。
- 值最长1000字符。为避免修改历史业务含义，已有非 null 值不可改写/清空，包括空字符串；停用旧节点后新建替代节点。尚未设置值的节点可以补值。
- 父级可移动或清空成为根节点，拒绝自身/后代、循环、不存在的父级及移动后超过32层的结构。修改父级不改写历史数据或后代路径列。
- 状态用独立 `PUT /system/dict/:id/status`，需 `system:dict:disable`；新增需 `system:dict:create`，局部编辑需 `system:dict:update`。新节点默认启用，表单不把状态混入编辑接口。
- 不保留删除 API。当前模块没有可信的业务引用登记，无法证明节点从未投入使用；正常淘汰采用停用，历史节点及已有软删除数据保留。旧 `system:dict:delete` 授权不再对应可调用路由。
- 更新未提交字段保留原值；父级、尚未设置的值和备注支持 null，布尔 false 不被当作未提交。ID 为 PostgreSQL bigint 范围内字符串，不转换为 JS Number。

数据库只保存父子关系及字段，不存 fullPathId/fullPathName/pathIds/pathNames。API 不默认返回完整路径；父级选项的层级由管理集合临时组装。订单等业务如需历史事实，应自行保存 dict_id、code/value/name 快照；字典模块不强制这些业务表结构。

所有写入在 READ COMMITTED 事务中先获取字典 advisory lock，再校验当前父链、循环及子树高度。事务提交后删除缓存，不主动重建。直接 SQL 导入绕过校验，需在维护窗口检查环、孤儿和深度并清理缓存。

## 查询与安全边界

直接下级按 `pid` 索引查询，不递归加载下级，不读取一级整树。`hasChildren` 用 `EXISTS` 与 `idx_sys_dict_pid` 计算，包含停用但未删除的直接下级。为了正确传播祖先停用状态，children 查询同一 SQL 内仅递归追溯锚点祖先；下级部分始终是 `WHERE pid = id`。roots 直接查询 `pid IS NULL`。

descendants 从指定节点使用 PostgreSQL recursive CTE；管理默认 flat、不含自身，可选择 includeSelf/tree/enabledOnly。业务强制有效过滤，查询停用祖先下的节点也不能绕过整条分支状态。flat/tree 在内存迭代组装，不保存物化路径，不保留 rootCode 兼容。

工程上限32层、一次定点查询最多10000节点（descendants安全检查集合包含锚点），超限报错，不静默截断。每个读写事务的 statement_timeout=3秒。业务接口每实例每用户每分钟120次，窗口表最多10000个有效用户；跨实例整体限流由部署网关补充。当前 tenant_id 仍是默认1的预留字段，不提供多租户隔离。

## Cache-Aside

管理全量列表使用 `sys:dict:{1}:admin:list`，缓存未筛选完整基础集合；MISS一次SQL，flat/tree在内存组装，共用集合。管理员低频读取不需要 revision 或三级缓存，TTL60秒，加0–9秒抖动。

普通 Service 方法 `getChildren/getDescendants` 直接查 DB。业务控制器显式使用 `getCachedChildren/getCachedDescendants`，同时要求锚点 `cache_enabled=true` 才回填；默认 false。HIT直接返回，不额外查询开关；MISS在同一SQL读取锚点开关和下级集合。缓存固定有效集合（descendants含锚点），includeSelf/format只影响内存投影。

```text
sys:dict:{1}:children:{id}:enabled
sys:dict:{1}:descendants:{id}:enabled
```

任意 create/update/move/enable/disable 提交后，统一直接 DEL 管理键、当前及旧新祖先/父节点的业务键；移动和启停还清理子树锚点缓存，防止祖先有效状态变化后后代命中旧缓存。只查影响链/子树ID，不读整棵配置树；不调用 EXISTS 决定是否删除，不主动回填。

缓存能力复用共享 CacheService：分布式加载锁、防击穿、TTL jitter，新增可选回填条件和短超时/熔断。DEL同时删除对应加载锁，回填原子检查锁所有权，失效前开始的旧 loader 无权在失效后回填。没有 revision tree、root tree预加载、path cache、anchor分段或版本Lua；共享Lua仅用于标准加载锁所有权检查。

Redis故障200ms内降级DB，进程内熔断1秒，查询及已提交写入不依赖Redis成功。失效失败会告警，Redis恢复后陈旧值最迟由60–69秒TTL回收；这不是跨数据库与Redis的强一致事务。生产部署应保留告警并根据业务容忍度决定是否暂时停用缓存。

## 升级与恢复

`1790983591215-dict-cache-enabled.ts` 在隔离PostgreSQL18.6重放迁移基线后由 `pnpm migration:generate` 生成，仅为字典表增加 boolean NOT NULL DEFAULT false，不改写ID、值、父级、审计或软删除数据。现有索引/外键保持。

新增列为元数据默认值操作，仍需短暂 ACCESS EXCLUSIVE 锁。生产在维护窗口停写，先备份，再迁移、部署新后端/前端、运行setup补齐 `system:dict:disable`，明确给需要的管理角色授权并清理权限缓存/重新登录。普通 user 不自动获得管理权限。清理旧字典缓存前缀（包含旧 index/tree键），新代码不再引用旧键；可由现有缓存管理工具按前缀清理。本文不代表已执行日常或生产迁移。

本次是破坏性契约调整：移除 rootId/rootCode列表筛选、派生路径响应、删除API，编码/业务值修改及深度边界收紧；调用方改用指定ID接口，管理启停改用独立状态API。既有超32层数据不被删除，但定点查询拒绝异常范围，应通过管理移动或维护工具修复后再启用业务入口。

回滚先恢复匹配的前端/后端；数据库保留新增列可继续兼容旧应用。若确需 down，迁移锁表检查所有行（含软删除）：存在 cache_enabled=true 时拒绝丢弃配置，应保留列并前向修复；全部false时允许删除列，旧字典数据保持。

## 可重复验收

后端 `test/dict.integration.mjs` 使用 `DICT_TEST_DATABASE_URL` 指向 localhost `/postgres`，只创建并删除随机 `kuvibe_dict_test_*` 数据库；`DICT_TEST_REDIS_URL` 必须指向独立本机测试Redis的DB15。会删除本模块测试键，请勿使用日常/生产Redis。

```sh
pnpm --dir packages/backend build
# 环境变量提供上述两条独立测试连接，然后运行：
pnpm --dir packages/backend test:dict:integration
```

覆盖旧数据up/down/up、结构diff、children/descendants、空值、大ID、启停裁剪、移动/并发、code/value保护、缓存开关/MISS/HIT/失效/进行中旧回填、Redis故障、结果/深度上限、setup及HTTP/RBAC/Swagger。

前端 `playground/tests/dict/helpers.test.ts` 继承应用现有Vitest配置；`tests/dict/_preview.html` 与 `_preview.ts` 是独立UI夹具，模拟请求并展示调用记录，不读写日常业务库，用于验证懒加载、搜索、表单和按钮。维护归属Playground字典模块，不参与产品路由或构建。真实后端行为由前述HTTP/Redis集成验证；生产规模与零停机演练独立执行。
