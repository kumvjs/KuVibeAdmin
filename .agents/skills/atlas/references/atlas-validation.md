# Atlas 检查接入

权威迁移为 packages/core/src/migrations/*.ts，不能直接把该目录传给 Atlas SQL migration lint。Skill 不是 TypeORM 插件，不额外维护生产 Atlas 迁移历史。

## 前置检查

检查 atlas version 和 atlas migrate lint --help，读取已有 atlas.hcl。只用隔离 dev database，Atlas 会重放/清理其中结构，不能指向生产、共享或日常开发数据库。

官方说明从 v0.38 起 migrate lint 为 Pro 功能，migrate test 也需登录。缺少 CLI/许可时明确未运行，不自动购买、登录或上传数据库信息。

## TypeORM 验证副本

在忽略的临时目录准备 SQL 副本：完整已应用基线 + 按顺序导出的待应用 up SQL。基线包含索引、约束、扩展等依赖；仅本次 ALTER 无法重放。

- 纯 queryRunner.query 字面量可逐条核对导出，不混入 down。
- 含循环、条件查询、参数或业务调用时，不得用正则或空 QueryRunner mock 假装完整导出；在隔离库真实执行 TypeORM，明确 SQL 副本覆盖不到的行为。
- TypeScript 修正后同步副本，记录来源文件和版本；副本仅供验证，部署仍使用 TypeORM。
- 用专用临时 atlas.hcl，getenv() 引入 dev URL，不在命令行/日志暴露凭据。migration.dir 指向 SQL 副本，dev 指向隔离库，schema 范围一致。

配置就绪后，在配置所在目录按 CLI 实际支持参数执行：

```sh
atlas migrate hash --env review
atlas migrate validate --env review
atlas migrate lint --env review --latest <待应用迁移文件数>
```

review 是临时配置的环境名。处理 destructive、data-dependent 和锁/重写报告，再 hash/lint，不用 nolint 隐藏未解决问题。

hash 只更新完整性校验，validate 不证明业务数据安全。lint 不替代 TypeORM 带数据往返测试和部署演练。项目未用 Atlas Cloud 管理生产目标，不虚构 Cloud 状态或执行 Atlas apply。

来源：[Agent Skills](https://atlasgo.io/guides/ai-tools/agent-skills)、[Migration lint](https://atlasgo.io/versioned/lint)。
