# 系统字典

系统管理中的“字典管理”使用统一树节点：节点有名称、全局唯一编码、可选字符串值和父节点；任何节点都能继续添加下级，也可以同时有值和子节点。应用不设固定层级上限。

## 管理规则

- 根节点没有父级。节点编码以小写字母开头，可含数字、点、下划线和短横线，最长 100 字符；编码用于稳定定位，调整编码后消费方需同步引用。
- 名称最长 100 字符，同级名称唯一；不同父级可以同名。排序为非负整数，同级先按排序，再按 bigint ID 排列。
- 值最长 1000 字符，`null` 表示未设置，`""` 是有效空字符串；表单通过“设置节点值”开关区分两者。
- 可以修改父级跨树移动或清空父级成为根节点；不能把节点挂到自身或任意深度的后代。父级必须存在且未删除。
- 停用保留子节点的独立状态。`effectiveStatus` 只有自身和全部祖先都启用才为 1；管理查询显示停用分支，`enabledOnly=true` 则整体裁剪。即使从停用分支内的任意节点查询，也不能绕过其上级状态。
- 只允许软删除没有未删除子节点的节点，停用子节点也阻止删除；先删除或移动下级后再删除父级。软删除节点的编码、同级名称可以复用。

## 完整路径与下级查询

每个返回节点包括以下派生字段，始终从整棵树的根算到当前节点，包含自身；查询局部子树不会截断上级路径。

| 字段 | 示例 | 用途 |
| --- | --- | --- |
| `fullPathId` | `/1/2/3/` | 完整 ID 路径，首尾带分隔符；ID 始终为字符串 |
| `fullPathName` | `系统 / 用户状态 / 启用` | 人类可读展示路径 |
| `pathIds` | `["1", "2", "3"]` | 无歧义的 ID 路径数组 |
| `pathNames` | `["系统", "用户状态", "启用"]` | 名称包含 `/` 时仍可准确处理 |
| `depth` | `3` | 从 1 开始的绝对层级 |
| `hasChildren` | `true` | 是否存在未删除的直接下级，包括停用下级 |

数据库保存 `pid` 邻接关系，完整路径在读取时计算，不能由客户端覆盖。改名、移动时不批量改写所有后代；下一次读取立即反映新路径。递归查询采用 PostgreSQL `WITH RECURSIVE`、父级索引及路径数组循环保护，树组装/展开采用显式栈。参见 [PostgreSQL 递归查询](https://www.postgresql.org/docs/current/queries-with.html)。

在默认 `/api` 前缀下，以下示例可用于读取任意层级下级；完整参数和响应以 Swagger/OpenAPI 为准：

```text
GET /api/system/dict/list
GET /api/system/dict/2/descendants
GET /api/system/dict/2/descendants?format=tree&includeSelf=true
GET /api/system/dict/list?rootCode=system.user.status&format=flat&enabledOnly=true
```

`list` 默认返回全树；指定 `rootId` 或 `rootCode` 后默认只返回全部下级，二者互斥。`descendants` 默认扁平且不含自身；叶节点无下级时返回空数组，目标不存在时返回 404。`includeSelf=true` 可包含选定节点。`flat` 按深度优先树序返回节点，不带 `children`，适合很深的层级和程序消费。树形 JSON 和页面渲染仍受数据库、响应大小及浏览器资源限制。

更新 DTO 中未提交字段保持原值；父级、值和备注可用 `null` 清空，名称、编码、状态和排序不接受 `null`。所有 ID 必须为 PostgreSQL bigint 范围内的整数字符串，不转换为 JS Number。

## 页面与权限

页面复用 playground 的表格、弹窗和应用布局，提供新增根/下级、编辑、移动、删除、查看子树、返回全部及名称/编码搜索。父级选项展示完整路径，并排除当前节点与任意深度后代；服务端继续执行同一校验。页面展示节点自身状态和实际可用状态。

读操作要求 `system:dict:list`，写操作分别要求 `system:dict:create`、`system:dict:update`、`system:dict:delete`。控制器与操作按钮分别校验权限。setup 补齐 `SystemDict` 菜单和权限节点，保留已有自定义元数据；普通 user 角色不会自动获得管理权限。业务消费方也需获得读取权限。

本模块所有写操作在事务内先获取同一 advisory lock，再以 READ COMMITTED 快照检查父链或下级。这样并发互移、删除与新增不会通过过时状态校验。它适合低频管理写入；大量并发写入会串行等待。直接 SQL 导入不经过这些校验，应在停服维护窗口检查环、孤儿和停用祖先关系。`tenant_id` 沿用预留默认值，本模块不提供租户隔离。

## 迁移与验收

`1790771566235-add-system-dict.ts` 在隔离库重放当前迁移基线后通过 `pnpm migration:generate` 生成，仅创建新表、父级外键和索引，不回填或重写已有业务表。运行迁移后再启动包含字典模块的后端，随后按现有 setup 流程补齐菜单；升级已有环境时应在维护窗口执行并清理权限缓存，用户重新登录后获取新菜单。

回滚会锁定字典表并检查全部行。空表可回滚；存在任何数据（包括软删除数据）时拒绝删表。此时先停用字典入口并恢复旧应用，保留新增表，使用前向修复；不要删除迁移历史或清空数据绕过保护。既有表与旧应用仍兼容。生产执行不由模块开发授权；上线前按实际环境确认迁移和 setup 影响。

后端集成测试 `packages/backend/test/dict.integration.mjs` 会使用 `DICT_TEST_DATABASE_URL` 指向 localhost 的 `/postgres` 管理连接，仅创建并删除随机 `kuvibe_dict_test_*` 数据库，需要建库权限：

```sh
cd packages/backend
pnpm build
DICT_TEST_DATABASE_URL='<本机隔离测试实例的管理连接>' node --test test/dict.integration.mjs
```

用例覆盖旧数据迁移往返、空 schema diff、有数据拒绝回滚、千层查询、大 ID、路径更新、启停、重复、软删除、并发关系、初始化和真实 HTTP DTO/RBAC/Swagger。单元测试另覆盖一万层组装/展开；前端应用测试覆盖父级候选和空值提交。Atlas CLI 未安装时不会伪称通过 Pro lint，仍执行实际 PostgreSQL 验证。
