# Docker 配置与 PostgreSQL 18.6 隔离验收

时间：2026-09-30T13:04:58.6569714+08:00

## 背景与范围

- 变更集：20260930-docker-support；Level 2 运维能力，用户要求为项目配置 Docker，指定 PostgreSQL 18.6，并在完成后提交 Git。
- 初始工作树干净，KuVibe 0.3.3/schema 2 为有效维护状态；既有迁移和业务实现保留，不执行生产操作。
- 为开发者及单机部署提供可重复构建、依赖启动、显式迁移与初始化、HTTP 访问、持久化和生产配置文档。Vben、热更新、高可用不在本次范围。

## 决策与实现

- 根 Dockerfile 多阶段构建，Node.js 24 Debian slim/pnpm 11.25.0；backend 独立锁文件冻结安装，沿用根原生依赖许可。生产镜像不带 TypeScript/Jest 开发工具，包含编译迁移与 setup，node UID 1000 运行；仅修改数据目录权限，避免递归 chown 全部依赖带来的大量重复层及耗时。
- Compose 使用 backend、PostgreSQL 18.6-bookworm、Redis 8-bookworm；PostgreSQL 18 卷挂 /var/lib/postgresql（内部 PGDATA=/var/lib/postgresql/18/docker），Redis AOF，数据库/Redis 不发布宿主机端口。后端默认回环 7001，生产使用同一镜像与 HTTPS/CORS/Secure Cookie 设置。
- 严格允许列表构建上下文，排除宿主机环境、node_modules、附件、Git 和工程文档；复制 src 与独立 types 声明目录。数据库/Redis/附件/公开目录各有数据卷。
- scripts/docker-init.mjs 从模板独立随机生成 PostgreSQL/Redis/JWT/Refresh 四项值，独占创建根 .env，已有文件拒绝覆盖。根 .env 被 Git 忽略且不进镜像。
- 对照 setup.ts 的生成逻辑：已有进程密钥时不重新生成。工具容器创建当前 NODE_ENV 的空临时文件满足读取要求，所有密钥持续来自根 .env 注入；重跑保留管理员，不依赖一次性容器内生成的密钥。
- 迁移与初始化使用 tools profile 显式运行，启动/重启不修改数据库，synchronize=false。直接调用编译后的 TypeORM CLI，避免现有 pnpm 脚本强制 local。
- 健康检查调用生产也公开的只读时区接口，检查 HTTP 成功及统一 success 字段；不将其声称为每次数据库/Redis 连通性探测。
- 修复空 AUTH_COOKIE_DOMAIN 校验：空值视为未配置，沿用 host-only；非法域名与 production HTTP/Secure Cookie 校验仍拒绝。
- 补齐 backend 锁文件缺少的五项既有清单依赖；保留已有锁定条目，不更改清单依赖声明。
- 未采用自动 synchronize 或修改历史迁移。隔离启动发现 CommonEntity 已提交的 tenantId='1' 预留列缺少迁移，新增 1790744400000 为 13 表添加 bigint NOT NULL DEFAULT 1。默认值依据 CommonEntity 的既有明确声明，不提供租户隔离能力。down 在同一事务中先锁全部表、检查非默认值，再删列；存在非 1 时拒绝回滚。
- 原生多阶段构建与启动顺序参考 pnpm / Docker 官方指南；18.6 标签与新数据目录依据 PostgreSQL 官方镜像说明。

## 验证与审查

- Docker Compose 冻结构建通过；最终镜像包版本 1.3.0。
- 独立项目 kuvibe-admin-docker-test、新卷、宿主机 17031，实际数据库报告 18.6 (Debian 18.6-1.pgdg12+2)，PostgreSQL/Redis/backend 均 healthy。
- 既有四条迁移加新 tenant_id 迁移执行成功。migration-timezone.integration.mjs 在 atlas_migration_test 通过：代表性旧行、有效/过期令牌、软删除、微秒、NULL、默认值、索引/约束与非 UTC 会话，时间及 tenant_id 的 up/down/up；最终实体只读 diff 为空，非默认租户数据阻止 down 且所有列仍保留。
- PostgreSQL 18 将 NOT NULL 表示为显式 pg_constraint，新增列后测试只排除新增的 NOT NULL tenant_id 来比较原约束，保留对所有既有约束的校验。
- setup-data.integration.mjs 在 setup_test 通过，覆盖完整种子、最小授权、幂等、已有数据保护及冲突回滚。
- setup Docker 交互创建测试管理员，输出 JWT secrets are already configured；停服重跑跳过已有管理员，根 .env 哈希未变化。
- HTTP、实际 Argon2 登录、根 .env JWT HMAC 签名一致性、Redis 权限读取、Refresh Cookie 轮换均通过；local 和 production 两种模式均 healthy，production Cookie 为 Secure。
- UID 1000、附件/公开卷写入、Argon2/Sharp 原生调用通过；重建后两类卷文件仍在，公开文件可读而 /uploads 私有路径 404；镜像无 .env/.env.local 和 TypeScript。
- 缺失必要 Compose 密钥时拒绝配置；production HTTP 地址被原校验拒绝。
- 配置/setup/setup-cache 聚焦 Jest：3 suites、16 tests 通过。typecheck、改动 TS/MJS ESLint、文档构建、git diff --check 通过。本机 pnpm 校验使用 verifyDepsBeforeRun=false 避免原工作区独立锁布局触发无关自动安装；用户 Docker 命令直接调用 Node/Docker CLI。
- Atlas CLI 不在环境中，Atlas Pro lint 未运行；不以编译或空库成功替代带数据验证。全量发布/浏览器验收、生产规模锁耗时、备份恢复与高可用演练未执行。
- 审查完成：密钥与测试产物未纳入 Git；既有迁移文件未修改；production 约束保留。独立测试容器与测试卷已删除，最终镜像和根 .env 留作用户使用。

## 文档、部署与恢复影响

- 新增 docs/guide/docker.md，并更新 README、快速开始、配置说明与导航；当前上下文补齐 Docker/版本事实，修正已过期的 backend 包名指针。
- 新迁移 up/down 需要排他锁，生产执行前需恢复性备份、确认 tenant_id 列是否已由 synchronize/人工存在、在生产规模副本量测锁及耗时，配置明确 lock_timeout/statement_timeout，并停服维护。已有列冲突应按实际历史纠正，不能删列或伪造迁移记录绕过。
- down 拒绝非默认租户值；业务已依赖该列时采用前向修复/备份恢复。应用回退保留旧镜像，数据库恢复需与应用版本匹配。
- 不同 PostgreSQL 主版本不能直接复用不兼容数据目录；按官方 pg_upgrade 或逻辑备份/恢复流程实施。
- 本次仅隔离验证，不宣称已有生产数据库具备立即上线条件。团队提示词与迁移交付标准仍引用 docs/guide/getting-started.md#团队统一使用方式。

## 版本与完成检查

- 需求身份 20260930-docker-support，原始基线 1.2.2，目标 1.3.0；最高语义/有效影响 minor（新增兼容 Docker 运行与部署能力，包含发现的启动先决条件修复）。
- 执行结果 bumped：根 package.json 1.2.2 → 1.3.0；packages/backend/package.json 1.2.2 → 1.3.0。重试沿用同一基线/目标，没有重复递增；两者与 CHANGELOG 同步。
- 锁文件没有项目版本字段或内部依赖引用需要随版本同步；另补齐缺失的依赖锁条目以保证冻结安装。
- KuVibe schema 2、模板 revision 和安装状态不变：本次不改变 harness 结构或协议。业务接口与产品边界不变。
- 需求、实现、隔离验收、审查、文档、工程笔记、版本一致性完成；按用户授权执行本次 Git 提交，不打 tag 或推送/发布。
