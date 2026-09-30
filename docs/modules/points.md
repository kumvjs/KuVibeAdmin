# 用户积分

积分账户采用PostgreSQL事务记账，Redis不参与余额计算。M1已提供账户、来源批次、流水、增加、扣减、冻结、核销、解冻和完整冲正；充值套餐、订单和渠道支付继续按开发计划实施。

## 记账规则

积分为整数、不可提现。ID和积分数以十进制字符串传输，服务使用BigInt，避免JavaScript安全整数上限导致精度丢失。可用和冻结余额均非负。

每次变更在一个事务内更新账户、来源批次与不可变流水，记录变更前后值、业务凭证、操作者和trace。同一账户按流水sequence串行；幂等键重试返回原结果，同键不同内容冲突。积分“删除”是扣减或冲正，不能删流水或直接覆盖余额。

赠分先于基础积分使用，各类按先入先出分配。冻结返回凭证，捕获/解冻可以分次进行，但不能超过该凭证剩余额度，也不能使用其他账户的凭证。完整冲正目前仅支持原发放/扣减；发放对应批次已消费/冻结时拒绝自动冲正，不能挪用别的充值积分。

## 用户查询与管理

本人账户和流水查询均需登录；管理端权限分别为`system:points:read/grant/debit/freeze/capture/unfreeze/reverse`。DTO和完整端点见Swagger，流水使用sequence游标，页大小最多100，不开放历史改删接口。

`pnpm setup`补齐“系统管理→积分管理”权限目录，普通user角色不获得管理权限。当前目录仅用于授权分组，未交付独立前端页面。用户停用/软删除保留财务数据，拒绝常规积分写入；财务外键阻止硬删除用户。

## 迁移与验证

迁移`1790748558277-add-points-ledger.ts`新增六张表及唯一/非负约束，以触发器阻止流水和分配事实UPDATE/DELETE/TRUNCATE。数据库owner仍是可信运维边界，生产凭证不能交给终端用户。

空积分表可回滚；任意新表存在记录就拒绝删表回滚，需关闭业务入口并前向修复。新表对旧sys_user建立外键，上线应设置锁超时并验证生产规模影响；本地隔离库通过不表示生产可直接迁移。迁移开发流程沿用[团队统一入口](../guide/getting-started.md#团队统一使用方式)。

真实数据库测试位于`packages/backend/test/points.integration.mjs`，显式要求`POINTS_TEST_DATABASE=kuvibe_billing_test`与本机/本项目Docker主机；另需空的`kuvibe_billing_test_migration`进行旧数据与迁移往返验证，事务结束回滚。它不清空开发库，首次运行创建独立测试库后执行：

```bash
node scripts/docker-dev.mjs exec -T postgres /bin/sh -c 'createdb -U "$POSTGRES_USER" kuvibe_billing_test'
node scripts/docker-dev.mjs exec -T postgres /bin/sh -c 'createdb -U "$POSTGRES_USER" kuvibe_billing_test_migration'
node scripts/docker-dev.mjs exec -T backend /bin/sh -c 'POINTS_TEST_DATABASE=kuvibe_billing_test node --test test/points.integration.mjs'
```

测试会保留专用测试库的测试账目供检查；重复运行使用新的测试用户。迁移测试库必须保持无已提交的业务表，不能用于开发。
