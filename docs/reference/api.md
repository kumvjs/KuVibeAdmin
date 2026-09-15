# HTTP API

以下列表来自当前 Controller 实现。默认全局前缀为 `/api`；表中路径省略此前缀。

## 已实现接口

| 方法 | 路径 | 鉴权 | 功能 |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | 公开 | 用户名密码登录，返回 Access Token 并设置 Refresh Token Cookie |
| `POST` | `/auth/refresh` | 公开 | 从 Cookie 读取并轮换 Refresh Token |
| `POST` | `/auth/logout` | JWT | 注销当前 Access Token，并撤销和清除请求中的 Refresh Token |
| `GET` | `/auth/codes` | JWT | 返回当前用户有效的菜单/按钮 `authCode` 数组 |
| `GET` | `/menu/all` | JWT | 按启用角色授权返回 Vben 动态路由树，并补齐有效父路由 |
| `GET` | `/system/menu/list` | JWT + `system:menu:list` | 返回包含按钮和停用项的完整菜单管理树 |
| `GET` | `/system/menu/name-exists` | JWT + `system:menu:list` | 检查菜单名称是否重复，可排除正在编辑的菜单 ID |
| `GET` | `/system/menu/path-exists` | JWT + `system:menu:list` | 检查菜单路径是否重复，可排除正在编辑的菜单 ID |
| `POST` | `/system/menu` | JWT + `system:menu:create` | 新增并校验 Vben 五类型菜单，返回 boolean |
| `PUT` | `/system/menu/:id` | JWT + `system:menu:update` | 修改菜单并校验父子关系，返回 boolean |
| `DELETE` | `/system/menu/:id` | JWT + `system:menu:delete` | 软删除无子节点且未被角色引用的菜单，返回 boolean |
| `GET` | `/system/dept/list` | JWT + `system:dept:list` | 返回包含停用项的完整部门树 |
| `POST` | `/system/dept` | JWT + `system:dept:create` | 新增部门，返回 boolean |
| `PUT` | `/system/dept/:id` | JWT + `system:dept:update` | 修改部门及其父级、排序和状态，返回 boolean |
| `DELETE` | `/system/dept/:id` | JWT + `system:dept:delete` | 软删除无子部门且无用户引用的部门，返回 boolean |
| `GET` | `/system/role/list` | JWT + `system:role:list` | 按 Vben 查询条件返回 `{ items,total }` 角色分页 |
| `POST` | `/system/role` | JWT + `system:role:create` | 新增角色并保存菜单/按钮授权，返回 boolean |
| `PUT` | `/system/role/:id` | JWT + `system:role:update` | 局部修改角色或原子替换授权，返回 boolean |
| `DELETE` | `/system/role/:id` | JWT + `system:role:delete` | 删除未受保护且无用户引用的角色，返回 boolean |
| `GET` | `/user/info` | JWT | 返回专用 DTO：`userId`、`username`、`realName`、`avatar`、`homePath`、`desc` 与角色数组 |
| `GET` | `/system/user/list` | JWT + `system:user:list` | 按 Vben 查询条件返回 `{ items,total }` 用户分页 |
| `POST` | `/system/user` | JWT + `system:user:create` | 新增用户并分配角色，返回 boolean |
| `PUT` | `/system/user/:id` | JWT + `system:user:update` | 局部修改用户、角色或重置密码，返回 boolean |
| `DELETE` | `/system/user/:id` | JWT + `system:user:delete` | 撤销会话并软删除用户，返回 boolean |
| `GET` | `/table/list` | JWT；仅非生产环境 | 返回确定性的 Vben 演示表格 `{ items,total }` |
| `POST` | `/upload` | JWT；仅非生产环境 | 上传一张临时 JPEG/PNG/WebP 图片，返回 `{ url }` |
| `GET` | `/demo/bigint` | JWT；仅非生产环境 | 返回包含超长 JSON 数字字面量的固定测试响应 |
| `GET` | `/status` | 公开；仅非生产环境 | 模拟查询参数指定的 HTTP 状态码，缺省为 200 |

`AiController` 和 `CacheController` 当前没有路由，不能作为可用 API。系统模块已发布部门、角色与菜单管理路径；菜单模块还提供运行时 `/menu/all`。

## 动态菜单

```http
GET /api/menu/all
Authorization: Bearer eyJ...
```

普通用户通过启用角色与 `sys_role_menu` 获得菜单；超级角色不要求逐项映射。响应排除按钮、禁用记录以及无完整有效父链的记录，并递归按 `meta.order`、`name` 排序。返回业务数据只包含 Vben 路由字段，例如 `name`、`path`、`component`、`redirect`、`meta` 和 `children`，位于统一响应的 `data` 字段。

## 系统菜单列表

`GET /api/system/menu/list` 需要 `system:menu:list` 权限，`super` 角色由全局 RBAC Guard 放行。接口返回所有未软删除记录，包括按钮和 `status=0` 的停用菜单；不会返回审计列或实体关系。Bigint `id`/`pid` 保持字符串，树按 `meta.order`、`name` 递归排序。为兼容 v5.7.0 编辑表单，`meta.activePath` 同时作为顶层 `activePath` 返回，但数据库不增加重复列。

同一权限还保护 `GET /api/system/menu/name-exists?name=...&id=...` 和 `GET /api/system/menu/path-exists?path=...&id=...`。`id` 可省略；编辑时传入正整数 bigint 字符串会排除当前记录。响应的 `data` 为 boolean，比较规则与当前大小写敏感的有效记录唯一索引一致。软删除记录不参与检查，相应部分唯一索引也允许后续复用其值。

`POST /api/system/menu`、`PUT /api/system/menu/:id` 和 `DELETE /api/system/menu/:id` 分别要求 create/update/delete 权限，成功时统一返回 `ResOp<boolean>`。所有类型都要求 `meta.title`；catalog/menu/embedded 要求本地 `path`，menu 还要求安全的组件标识，embedded/link 要求不含用户凭据的 HTTP(S) 地址，button 要求父级和冒号分段的 `authCode`。顶层 `activePath`、`linkSrc` 会归入 JSONB `meta`。父级只能是 catalog/menu；写服务在可串行化事务中拒绝无效父级、自引用、后代回挂和已有子节点的叶子类型转换，并把数据库唯一键或并发竞争转换成 HTTP 409。

删除使用软删除。只要仍有未软删除的子菜单或 `sys_role_menu` 引用，就会返回 HTTP 409；不会级联删除或自动改写角色权限。

写事务提交后，系统会定向失效受该菜单角色映射影响的用户以及启用 super 角色用户的权限码缓存；创建尚无普通角色映射，只需失效 super 用户。Redis 失效不使用全量键扫描。

## 部门管理

`GET /api/system/dept/list` 返回全部未软删除部门，包括 `status=0` 的停用项。Bigint `id`/`pid` 保持字符串，`created_at` 映射为 `createTime`；树在每一级依次按 `order`、`name`、`id` 排序。缺失父级、自指或历史循环数据会在响应投影中安全归根，保证每条记录恰好出现一次且 JSON 不成环。

`POST /api/system/dept`、`PUT /api/system/dept/:id`、`DELETE /api/system/dept/:id` 分别要求 `system:dept:create`、`system:dept:update`、`system:dept:delete`，成功响应统一为 `ResOp<boolean>`。请求字段沿用 Vben 的 `name`、`pid`、`status`、`remark`，并增加可选非负整数 `order`（默认 `0`，数值越小越靠前）。状态只接受数值 `0 | 1`。

写操作在可串行化事务中执行，完整父链会被校验和锁定；不存在的父级、自引用、挂到后代以及同级活动部门重名会被拒绝。删除使用软删除，只允许删除没有活动子部门、且没有任何现存或软删除用户引用的叶子部门。停用部门只修改该部门本身，不级联停用子部门或用户。

本批次仅提供 TypeORM 映射和业务逻辑，不生成或执行迁移。部署方需要按 `SysDeptEntity` 创建 `sys_dept`，并为 `sys_user` 增加 nullable、indexed、`RESTRICT` 的 `dept_id` 外键。

## 角色管理

`GET /api/system/role/list` 接受 `page`、`pageSize`、`name`、`id`、`status`、`remark`、`startTime`、`endTime`。`id` 是精确 bigint 字符串筛选，名称和备注是转义通配符后的大小写不敏感包含筛选，时间使用 ISO 8601 且开始时间不能晚于结束时间。响应业务数据为 `{ items,total }`；每项包含 `id/name/code/status/remark/createTime/permissions/isDefault`，其中 `permissions` 是数值顺序稳定的菜单/按钮 bigint 字符串 ID 数组。

`POST /api/system/role` 接收 `name/status/remark/permissions` 和可选 `code`。省略 code 时生成不可变的 `role:<uuid>`；公开接口不能创建 `super/admin/user` 保留码。`PUT /api/system/role/:id` 是局部更新，故状态开关可以只提交 `{ status }`；code 不属于更新 DTO，不能更改。提交 `permissions` 时会先锁定并验证全部未软删除菜单，再在同一可串行化事务中完整替换 `sys_role_menu`；省略该字段则保留现有授权。

`code=super` 或 `is_default=true` 的角色不能停用或删除。其他角色停用不会级联停用用户或删除用户角色关系；删除仍有任何 `sys_user_role` 引用的角色会返回 HTTP 409。修改成功后，只清理该角色当前所有用户的有效权限缓存，事务失败不会产生部分授权。

角色 `status` 与 Vben 一致保存为 smallint `0 | 1`。角色名称仅在未软删除记录中唯一，code 跨软删除全局唯一；`sys_user_role.role_id` 删除策略为 `RESTRICT`。本批不生成或执行迁移，部署方需要依据实体重建 `sys_role`、`sys_role_menu` 及相关外键。

## 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

成功业务数据：

```json
{
  "accessToken": "eyJ..."
}
```

该对象位于统一响应的 `data` 字段。管理端新建、重置及初始化脚本密码均要求 12–128 个字符，最终只保存 Argon2id PHC 哈希；登录请求为兼容既有客户端仍接受至少 6 个字符，但限制最大 128 个字符。

只有启用用户可以登录。未知账号或密码错误使用同一个凭据错误；账号存在、密码正确但状态已停用时返回 `USER_ACCOUNT_DISABLED`，且不会签发 Token、写入登录缓存或记录成功登录日志。

`/auth/refresh` 同样保持统一 `ResOp` 响应，新的 Access Token 位于 `data.accessToken`。前端生成的 OpenAPI 客户端负责统一解包 `data`，后端不会为 Vben mock 的裸字符串响应增加例外。

## 用户管理

`GET /api/system/user/list` 接受 `page`、`pageSize`、`name`、`id`、`status`、`remark`、`startTime`、`endTime`、`deptId`。`name` 同时匹配展示名和登录账号，ID 使用 PostgreSQL bigint 字符串，状态只接受数值 `0 | 1`。响应业务数据为 `{ items,total }`，每项包含 `id/username/name/deptId/status/remark/createTime/roleIds`。

`POST /api/system/user` 在 Vben 的 `name/deptId/status/remark` 基础上要求 `username/password/roleIds`。username 是不可变登录身份，name 可编辑；password 只作为输入且不会回显；roleIds 是启用角色 ID，不是菜单 ID。所属部门必须存在且启用，并且至少分配一个启用角色。

`PUT /api/system/user/:id` 为局部更新，状态开关可只提交 `{ status }`。省略 roleIds 保留角色，提交 roleIds 时原子覆盖用户角色；提交 password 使用 Argon2id 重置密码。停用或密码重置会递增持久化会话版本、删除该用户所有 Refresh Token，并清理 Redis 中的令牌、在线状态、用户信息和权限缓存。Refresh 接口还会校验数据库中的启用状态及会话版本。

`DELETE /api/system/user/:id` 先删除 Refresh Token 和用户角色关系，再软删除用户并清理缓存。用户名唯一索引只覆盖未软删除记录，因此可由一个全新用户 ID 重新使用。系统拒绝停用、删除或移除最后一个启用 super 用户的 super 角色。

用户密码表只接受 `password_algorithm=argon2id` 与 `$argon2id$...` PHC 字符串，并保存正数 `session_version`。本批不生成迁移；部署方按实体直接创建新表，不迁移 MD5/`psalt` 或旧冗余 role 字段。

## Playground 演示接口

`PlaygroundModule` 只在 `NODE_ENV` 非 `production` 时注册。生产环境不存在 `/table/list`、`/upload`、`/demo/bigint`、`/status` 路由，并会显式拒绝 `/uploads/*` 静态访问。`GET/POST /test` 属于上游 mock 诊断接口，本项目不实现。

`GET /api/table/list` 支持 `page/pageSize/sortBy/sortOrder`，分页限制为每页最多 100 条，排序字段使用白名单。它返回固定的 100 条演示数据，进程重启后内容不变，不查询或创建业务数据库表。

`POST /api/upload` 接收且只接收 multipart 字段 `file`。文件不得超过 6 MiB，只允许 MIME 与文件魔数一致的 JPEG、PNG 或 WebP；原文件名不会用于磁盘路径。文件以 UUID 名称写入本地 `public/uploads/<UTC年>/<UTC月>`，URL 位于 API origin 的 `/uploads/...`，24 小时后由启动/上传时清理。它是公开 URL 的临时单机演示存储，没有元数据、所有权管理或删除 API，也没有病毒扫描；生产资产应另行选择对象存储、鉴权、内容扫描和生命周期策略。

`GET /api/demo/bigint` 为验证 Vben `json-bigint` 转换而保留原始 JSON 响应，两个 `id` 以超出 JavaScript 安全整数范围的数字字面量发送，不经过普通 JSON 对象序列化。除此之外，项目 JSON 接口仍使用统一 `ResOp<T>` 转换。

`GET /api/status?status=401` 使用标准错误信封和指定 HTTP 状态；不传 `status` 时返回 HTTP 200，以支持上游参数序列化页面只读取 `responseURL` 的用法。状态值限制为 200–599。

## Swagger

当 `SWAGGER_ENABLE=true` 时：

- UI：`/<SWAGGER_PATH>`，示例为 `/api-docs`；
- JSON：`/<SWAGGER_PATH>/json`；
- OpenAPI Server URL 指向 `/<GLOBAL_PREFIX>`。

WebSocket Swagger 的初始化在 `main.ts` 中被注释，目前不会暴露 `/ws-docs`。
