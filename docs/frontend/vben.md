# Vben Admin 对接

项目后端已覆盖 Vben 登录、动态菜单、系统管理和非生产 Playground 演示接口。前端仍需配置响应解包、Cookie、刷新逻辑和用户表单字段；M6 时区偏好尚未实现。

## OpenAPI-TS 快速对接

推荐让 Vben 直接从本项目 Swagger 生成请求函数和类型，再通过一个很薄的 `apiClient` 复用 Vben 的 Axios 实例并统一解包 `ResOp.data`。

### 1. 启动 Swagger 并安装生成器

确认后端启用了 `SWAGGER_ENABLE=true`，Swagger JSON 默认地址为：

```text
http://127.0.0.1:7001/api-docs/json
```

在 Vben 应用中安装 `@hey-api/openapi-ts` 和 Axios 插件，并增加脚本：

```json
{
  "scripts": {
    "openapi-ts": "openapi-ts"
  },
  "devDependencies": {
    "@hey-api/client-axios": "^0.9.1",
    "@hey-api/openapi-ts": "^0.98.1"
  }
}
```

### 2. 添加生成配置

在 Vben 应用目录创建 `openapi-ts.config.ts`：

```ts
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'http://127.0.0.1:7001/api-docs/json',
  output: 'src/client',
  plugins: [
    {
      name: '@hey-api/client-axios',
      throwOnError: true,
    },
    {
      name: '@hey-api/sdk',
      operations: { strategy: 'flat' },
    },
  ],
})
```

执行生成：

```bash
pnpm openapi-ts
```

`src/client` 是生成目录，应通过重新执行命令更新，不要手工修改其中的请求函数和 DTO。

### 3. 让生成客户端复用 Vben 请求实例

`request.ts` 中的 `requestClient` 必须安装 Vben 的统一响应拦截器：

```ts
requestClient.addResponseInterceptor(
  defaultResponseInterceptor({
    codeField: 'code',
    dataField: 'data',
    successCode: 0,
  }),
)
```

然后创建 `src/api/api-client.ts`：

```ts
import type { AxiosResponse } from 'axios'
import { client } from '#/client/client.gen'
import { requestClient } from './request'

type ApiOptions<F extends (...args: any[]) => Promise<any>> = Parameters<F>[0]

type UnwrappedResponse<F extends (...args: any[]) => Promise<any>> =
  ReturnType<F> extends Promise<infer R>
    ? R extends { data: undefined, error: unknown }
      ? never
      : R extends AxiosResponse<infer Body>
        ? Body extends { data?: infer Data } ? Data : Body
        : R extends { data?: infer Data } ? Data : R
    : never

client.setConfig({
  axios: requestClient.instance,
  throwOnError: true,
})

export async function apiRequest<F extends (...args: any[]) => Promise<any>>(
  apiMethod: F,
  options: ApiOptions<F> = {} as ApiOptions<F>,
): Promise<UnwrappedResponse<F>> {
  const response = await apiMethod({ throwOnError: true, ...options })
  return response as unknown as UnwrappedResponse<F>
}
```

### 4. 调用生成接口

生成函数名称由 Swagger `operationId` 决定，以实际生成结果为准：

```ts
import {
  authControllerCodes,
  authControllerLogin,
  authControllerRefresh,
  userControllerInfo,
} from '#/client'
import { apiRequest } from '#/api/api-client'

const loginResult = await apiRequest(authControllerLogin, {
  body: { username: 'admin', password: 'your-password' },
  withCredentials: true,
})
accessStore.setAccessToken(loginResult.accessToken)

const userInfo = await apiRequest(userControllerInfo)
const accessCodes = await apiRequest(authControllerCodes)
console.log(userInfo.userId, userInfo.roles, accessCodes)
```

刷新接口同样返回 `ResOp<{ accessToken }>`，不要为它创建“裸字符串”特例：

```ts
const result = await apiRequest(authControllerRefresh, {
  withCredentials: true,
})
accessStore.setAccessToken(result.accessToken)
```

登录、刷新和退出必须携带 `withCredentials: true`，否则浏览器不会接收或发送 HttpOnly Refresh Token Cookie。

## 基础配置

开发环境 API base URL 通常配置为：

```text
http://localhost:7001/api
```

除公开接口外，请求头需要携带：

```http
Authorization: Bearer <accessToken>
```

所有需要 Refresh Token Cookie 的请求必须启用 `credentials: 'include'` 或 Axios `withCredentials: true`。

## 响应解包

后端统一响应不是直接返回业务对象：

```json
{
  "code": 0,
  "data": { "accessToken": "..." },
  "message": "success",
  "success": true,
  "traceId": "..."
}
```

Vben 请求客户端应以 `code === 0` 或 `success === true` 判断成功，并把 `data` 作为业务结果。HTTP 401 用于无效 / 缺失 / 过期 Refresh Token；HTTP 403 用于权限不足或浏览器 Origin 不受信任；业务错误还需读取响应体 `code`。

## 登录流程映射

| Vben 场景 | 当前接口 | 说明 |
| --- | --- | --- |
| 登录 | `POST /auth/login` | body 为 `username`、`password`；返回 `data.accessToken` |
| 当前用户 | `GET /user/info` | 返回 `userId`、`username`、`realName`、`avatar`、`homePath`、`desc` 和 `roles` |
| 权限码 | `GET /auth/codes` | 返回当前用户有效的菜单/按钮 `authCode` 数组 |
| 刷新令牌 | `POST /auth/refresh` | Refresh Token 来自 HttpOnly Cookie，成功后轮换 Cookie |
| 退出 | `POST /auth/logout` | Access Token 进入黑名单，并撤销/清除 Refresh Token |
| 动态菜单 | `GET /menu/all` | 返回当前用户可访问的 Vben 动态路由树 |

登录响应业务码为 `20004` 时表示账号已停用，前端应展示后端消息并结束登录流程，不应继续调用刷新接口或写入 Access Token。

登录请求示例：

```ts
const result = await apiRequest(authControllerLogin, {
  body: { username, password },
  withCredentials: true,
})

tokenStore.setAccessToken(result.accessToken)
```

## 当前兼容性注意事项

### CORS 与 Cookie

后端通过 `APP_CORS_ORIGINS` 使用精确 Origin 白名单，不再把 `credentials: true` 与通配符来源组合。默认本地配置支持 Vben 的 `http://localhost:5999` 和 playground 的 `http://localhost:5555`；使用其他端口时需要加入完整 Origin。

本地默认 Refresh Token Cookie 为 host-only、`Secure=false`、`SameSite=Lax`，Path 限制为 `/api/auth`（全局前缀变化时同步变化）。生产环境要求公开 API 和前端 Origin 均为 HTTPS，并强制 Secure Cookie。不要为了方便把 Refresh Token 暴露给 JavaScript。

同站子域部署通常保留 `SameSite=Lax` 即可。只有前后端确实属于不同站点时，才设置 `AUTH_COOKIE_SAME_SITE=none` 与 `AUTH_COOKIE_SECURE=true`；此时必须把前端准确 Origin 加入白名单。后端会在所有非安全浏览器请求进入认证和业务逻辑之前校验 Origin，非白名单来源返回 HTTP 403。

### 权限语义

后端细粒度权限来自 `sys_menu.auth_code`，对应 Vben 的 `authCode`。`/auth/codes` 与后端 `RbacGuard` 使用同一套 Redis 缓存和 PostgreSQL 回源逻辑，只返回启用角色关联的启用菜单/按钮权限码；启用的 `super` 角色返回全部启用权限码。角色 code 与权限 code 不混用，角色身份从 `/user/info.roles` 获取。

菜单数据模型按 v5.7.0 的 `catalog | menu | embedded | link | button` 五类型建立，并以 JSONB 保存可扩展 `meta`；字段直接采用 Vben 语义，Bigint 菜单 ID 保持字符串，状态直接使用 `0 | 1`。旧菜单表数据不会迁移，需要重新初始化菜单与角色关联。

`GET /menu/all` 已可直接供 Vben 的 `getAllMenusApi()` 使用。普通用户只获得启用角色授权的路由，并自动补齐完整的启用父路由；超级角色获得全部有效路由。按钮只用于权限码，不会作为路由返回。禁用、父链缺失、循环或没有 `path` 的分支会被排除，树中每一级按 `meta.order` 升序、再按唯一 `name` 排序。响应仍由全局 `ResOp` 包装，OpenAPI 客户端解包后业务结果就是 `RouteRecordStringComponent[]`。

菜单写接口已开放：新增、修改、删除分别调用 `POST /system/menu`、`PUT /system/menu/:id`、`DELETE /system/menu/:id`，生成客户端解包后得到 boolean。按钮必须提供父级与 `authCode`；menu 必须提供本地 `path` 和组件；embedded/link 的目标必须是 HTTP(S) URL。后端会兼容顶层 `activePath`/`linkSrc` 并归入 `meta`，但不会信任前端的名称或路径预检查。

`GET /system/menu/list` 可供 playground 菜单管理表格和父菜单选择器读取完整树；它包含按钮和停用项，并要求当前用户具有 `system:menu:list` 权限。`GET /system/menu/name-exists` 与 `GET /system/menu/path-exists` 的生成客户端解包后直接得到 boolean；编辑时将当前菜单 bigint 字符串 ID 一并传入即可排除自身。创建、修改和删除使用独立权限码，父级只能选择 catalog/menu。删除存在子节点或角色引用的菜单会收到 HTTP 409，前端应保留抽屉/列表状态并展示后端消息。

菜单写事务提交后，后端会失效受该菜单启用角色映射影响的用户以及启用 super 角色用户的权限缓存。角色和用户授权写服务也执行对应的定向失效。

### 部门管理

Vben v5.7.0 的部门页可使用 `GET /system/dept/list`、`POST /system/dept`、`PUT /system/dept/:id` 和 `DELETE /system/dept/:id`。生成客户端解包后，列表得到递归部门数组，写操作得到 boolean。响应保留 bigint 字符串 ID，包含 `id`、可选 `pid`、`name`、数值 `status`、可选 `remark`、`order`、`createTime` 和可选 `children`。

后端额外支持表单可选字段 `order`，默认值为 `0`，同级部门按 `order/name/id` 稳定排序。父级必须存在，不能选择自身或后代；同一父级下活动部门名称不能重复。删除仍有关联子部门或用户的部门会收到 HTTP 409。停用部门不会自动停用其子部门或用户，前端不应推断这种级联语义。

部门及用户归属字段由部署方依据实体映射新建，本代码不执行数据库迁移；上线接口前必须先创建 `sys_dept` 和 `sys_user.dept_id`。

### 角色管理

Vben v5.7.0 角色页可使用 `GET /system/role/list` 及角色 POST、PUT、DELETE。生成客户端解包后，列表结果是 `{ items,total }`，写操作结果是 boolean。查询支持页面现有的 `page/pageSize/name/id/status/remark/startTime/endTime`；角色项的 `permissions` 是菜单管理树中的 bigint 字符串 ID。

创建角色可额外提交不可变 `code`，省略时后端生成 `role:<uuid>`；编辑接口不会接受 code。权限树值会在事务中整体替换，任何不存在或已软删除的菜单 ID 都会使整次修改失败。只切换状态时前端可继续提交 `{ status }`，不会清空权限。

`super` 和部署方标记的默认角色不能停用或删除；存在用户引用的普通角色也不能删除。角色授权或状态提交成功后，后端会定向清除所有受影响用户的权限缓存。角色表和关联表仍由部署方依据实体创建，本代码不执行迁移。

### 用户管理

Vben v5.7.0 用户页可使用 `GET /system/user/list` 及用户 POST、PUT、DELETE。生成客户端解包后列表为 `{ items,total }`，写操作为 boolean；页面已有的 `page/pageSize/name/id/status/remark/startTime/endTime/deptId` 查询全部受支持。

锁定版上游的用户类型声明了 `permissions`，但实际表单 schema 没有绑定该字段，抽屉中的菜单树插槽不会提交有效授权。项目不引入直接用户菜单授权；前端用户表单应新增角色选择并提交 `roleIds`，角色选项来自角色列表。创建表单还需增加不可变 `username` 和至少 12 个字符的初始 `password`；`name` 继续作为可编辑展示名。

编辑时省略 roleIds 会保留现有角色，状态开关仍可只发送 `{ status }`。角色修改后权限缓存立即失效；停用、删除或密码重置会强制该用户已有会话失效。最后一个启用 super 管理员不能被停用、删除或移除 super 角色，前端应展示后端 HTTP 409 消息。

用户表由部署方依据实体直接新建，不执行迁移，也不保留 MD5/`psalt` 数据。若已有旧环境需要保留用户，必须单独设计经审核的数据迁移和强制重置流程，不能把旧哈希直接复制到新表。

### Playground 演示接口

Playground 保留 `/table/list`、`/demo/bigint` 和 `/status`，只在 local/development/test 环境存在。表格使用固定 fixture，bigint 接口刻意返回原始超长数字 JSON，status 接口默认 200 并允许通过 `status` 查询参数模拟 200–599。

`POST /upload` 已迁入生产可用的系统附件模块，仍要求 Access Token 和单个 multipart `file`，返回 `ResOp`，业务数据保留 `url` 并增加附件 ID、可见性等信息。格式/大小按数据库用途策略配置，默认用途是 `attachment`，需预先配置。私有 URL 必须携带认证下载 Blob，不能直接作匿名图片地址；头像用 `purpose=avatar` 上传后调用绑定接口，明确公开且已绑定的图片才提供匿名地址。详见[系统附件](../modules/attachments.md)。上游 mock-only 的 GET/POST `/test` 不提供。

### 尚缺适配

- 用户表单的前端 `username/password/roleIds` 字段适配；
- M6 用户时区偏好接口。

建议先固定 Vben 所用版本及其 mock API 契约，再以契约测试逐个补齐，避免仅凭路径名称适配。
