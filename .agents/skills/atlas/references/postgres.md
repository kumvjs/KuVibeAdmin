# PostgreSQL 审查与验证

| 变更 | 处理要求 |
| --- | --- |
| 同列 DROP + ADD | 对比旧/新类型，优先 ALTER TYPE 或 RENAME；保留值、默认值、约束、注释、索引与外键。不能无损转换时采用新列、回填、验证、切换的分阶段方案。 |
| timestamp → timestamptz | 确认旧值代表的时区；当前连接 UTC、用户展示偏好和开发者所在地均不是历史证据。检查是否按列/来源混存。 |
| 新增 NOT NULL | 先允许 NULL、兼容写入、按业务规则回填、验证后加约束；不能给令牌过期时间填 now() 来消除错误。 |
| SET NOT NULL / UNIQUE / FK | 预查 NULL、重复、孤儿记录，控制并发写入；按版本考虑 NOT VALID / VALIDATE CONSTRAINT 等分阶段操作。 |
| 删列/表、缩短长度、精度降低、枚举删除 | 说明损失和旧应用兼容性，不能自动猜测转换或忽略错误。 |
| 索引变化 | 对比键顺序、谓词、唯一性及用途；区分删列附带重建和真实设计变化。 |
| 长 DDL / 回填 | 评估表大小、ACCESS EXCLUSIVE 锁、重写、WAL、复制延迟、磁盘空间，设置适用的 lock_timeout / statement_timeout。 |

CREATE INDEX CONCURRENTLY 不能放在普通迁移事务中；应单独迁移并核对 TypeORM 全局事务模式和迁移 transaction 设置，处理失败残留的无效索引，不全局关闭事务掩盖问题。

## 时间转换

仅在证实旧列保存 UTC 墙上时间后：

```sql
ALTER TABLE "public"."sys_user"
  ALTER COLUMN "created_at" TYPE timestamptz
  USING "created_at" AT TIME ZONE 'UTC';
```

旧数据为北京时间时使用 Asia/Shanghai。不要依赖 ::timestamptz 的会话时区。反向转换使用同一来源时区：

```sql
ALTER TABLE "public"."sys_user"
  ALTER COLUMN "created_at" TYPE timestamp without time zone
  USING "created_at" AT TIME ZONE 'UTC';
```

涉及 DST 重复时间或新写入数据时，反向结构转换未必保留全部时间点语义。检查默认值在新类型中的含义，必要时显式调整。

本次 1789648814246 迁移的历史数据为 UTC：依据用户于 2026-09-17 的明确答复。此证据不自动适用于未来其他部署。

## 验证与交付

- 使用本次新建的隔离 PostgreSQL，主版本/扩展/schema 与目标匹配；不清理用户共享数据库。
- 重放旧迁移，覆盖历史创建/更新时间、非空软删除时间、有效及过期令牌、附件过期时间、允许 NULL 的数据。
- 执行 up，断言行数、主键、时间点、软删除状态、默认值、约束、索引及业务读取行为。
- 可回滚时执行 down、比对旧值、再次 up；不可逆变更提供前向修复/备份恢复方案。
- 迁移后对实体做只读 schema diff，关闭 synchronize 和 migrationsRun，检查残留差异。
- 记录环境、耗时和未验证项。小样本不能证明线上锁等待预算可接受；上线前需生产规模副本演练或分阶段方案。验证新旧应用共存的读写兼容性。

参考：[PostgreSQL 时间类型](https://www.postgresql.org/docs/current/datatype-datetime.html)、[ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)。
