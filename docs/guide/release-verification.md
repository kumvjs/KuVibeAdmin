# 发布验收

当前支持的 Vben 基线是 `v5.7.0` / `63a38dce49ba109f61607994e21ba921d8e970e9`。本次是首个 KuVibeAdmin 品牌正式版，没有第二个已发布兼容基线；升级时再按上游锁和升级模板验证旧、新基线。

## 常规检查

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm test --runInBand
pnpm typecheck
pnpm build
pnpm docs:build
pnpm vben:contract:test
pnpm vben:contract:check
```

`vben:contract:check` 对未修改的固定上游源码校验快照；不能拿经过联调适配的前端目录作原始快照输入。`pnpm lint:check` 是全量只读检查，现存源码与历史生成迁移有 lint 债务；本次改动代码必须单独检查通过，不把全量检查失败记录为通过，也不修改已应用迁移来消除格式告警。

## 独立数据库集成

测试只能使用专用 PostgreSQL 和 Redis，不可指向日常开发或生产环境。下面容器没有持久化卷，只服务于验收：

```bash
docker run -d --name kuvibeadmin-test-postgres -e POSTGRES_PASSWORD=test_only -e POSTGRES_DB=m8_test -p 127.0.0.1:55438:5432 postgres:17.11
docker run -d --name kuvibeadmin-test-redis -p 127.0.0.1:56388:6379 redis:8.2.9

RELEASE_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55438/m8_test \
RELEASE_TEST_REDIS_URL=redis://127.0.0.1:56388 \
pnpm test:release
```

发布测试创建随机子数据库，执行全部迁移 up/down/up，断言与实体没有结构差异，启动实际 `dist/src/main.js`，覆盖 Passport、认证、CRUD、事务、并发、权限缓存、时区、OpenAPI 和会话撤销。测试结束删除自己的随机子库，Redis 不执行全量清空，需保持测试专用。默认以 production 模式验证，HTTPS 公开地址由测试配置模拟反向代理部署；不把这个配置用于真实服务。

其他测试分别需要空测试库 `atlas_migration_test`、`m6_test`、`m71_test`：

```bash
MIGRATION_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55438/atlas_migration_test pnpm test:migration:integration
TIMEZONE_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55438/m6_test pnpm test:timezone:integration
UPLOAD_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55438/m71_test \
UPLOAD_TEST_REDIS_URL=redis://127.0.0.1:56388 \
NODE_ENV=production pnpm test:upload:integration
```

时间戳测试用带数据 up/down/up 验证 UTC 历史语义、非 UTC 会话、微秒、NULL、软删除、索引和约束。Atlas CLI 未安装时按项目 Skill 执行 PostgreSQL 替代验证；这不代表 Atlas Pro lint 已执行，也不代表生产规模零停机演练。

## Vben 浏览器联调

前端不进入后端发布源码。将 Vben 克隆到独立临时目录，固定上述 commit，安装前端依赖及 Playwright Chromium。先构建上游 `@vben/node-utils` 与 `@vben/vite-config` 的工具入口；常规上游安装脚本会准备这些入口。

```bash
VBEN_TEST_SOURCE=/absolute/path/to/temporary-vben node scripts/e2e/prepare-vben.mjs
```

适配脚本关闭 Mock、设置后端动态路由、解包本项目 Refresh 响应、为 logout 携带 Access Token，并用部门创建按钮演示后端权限码；额外的 `release-e2e.ts` 仅供测试导入真实 Vben API 调用器，不能用于生产。

在独立终端保持后端测试夹具运行：

```bash
RELEASE_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55438/m8_test \
RELEASE_TEST_REDIS_URL=redis://127.0.0.1:56388 \
RELEASE_TEST_BROWSER_HOLD=true pnpm test:release
```

在前端临时目录启动 playground，固定 `http://localhost:5555`：

```bash
pnpm --filter @vben/playground exec vite --host localhost --port 5555
```

然后在本仓库运行：

```bash
VBEN_TEST_SOURCE=/absolute/path/to/temporary-vben node scripts/e2e/vben-browser.mjs
```

覆盖浏览器登录、动态路由、401 后自动刷新、部门/角色/用户/菜单真实 API CRUD、列表页面、按钮显隐和后端越权拒绝。用户创建通过前端 API 调用器提交 `username/password/roleIds`；上游用户演示表单本身仍须按接入文档适配，不将该测试等同于交付完整前端。

## 部署与恢复

先备份数据库并审查待执行迁移，确认时间戳旧值确为 UTC，在维护窗口执行，再部署构建产物和环境配置。保持数据库名、schema、Redis 键与 API 前缀，品牌更名不迁移这些运行标识。回退应用版本前确认结构兼容性；时间戳迁移已提供 UTC 语义 down，但 DDL 的排他锁预算仍需在目标数据规模演练。正式版本由根目录及 core 清单同步，GitHub Release 发布源码；不向 npm 发布私有 core。

## 初始化基础数据专项验证

只使用独立测试实例，不连接业务数据库。测试自行创建随机数据库，以实体同步建立隔离测试表，并在 finally 中删除；该专项验证不替代迁移验收。

```bash
docker run -d --name kuvibeadmin-setup-postgres -e POSTGRES_PASSWORD=test_only -e POSTGRES_DB=setup_test -p 127.0.0.1:55439:5432 postgres:17.11
SETUP_TEST_DATABASE_URL=postgres://postgres:test_only@127.0.0.1:55439/setup_test pnpm test:setup:integration
docker rm -f kuvibeadmin-setup-postgres
```

覆盖四个系统管理页面、一个附件管理二级目录、五项旧权限原地归组及角色关联保留、21 个管理权限、普通角色授权清理、其他角色保留、实际动态路由与有效权限、重复执行、软删除/停用冲突及事务回滚。脚本交互与缓存失败路径由 `pnpm test --runInBand src/scripts` 验证。
