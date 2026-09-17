# KuVibeAdmin 后端正式版

## 需求与范围

用户授权完成现有 Vben 兼容计划、更名 GitHub 仓库、建立 README 并正式发布；随后明确本次仅发布后端。前端仅作 M8 验收，AI Agents 路线不扩展。

## 验收与计划

- [ ] 补充真实 PostgreSQL/Redis、完整认证与授权缓存失效、迁移往返验收。
- [ ] 固定 v5.7.0 前端联调登录、刷新、菜单、按钮与系统管理；记录实际执行和环境限制。
- [ ] 修正发布阻塞项，统一当前品牌、README、启动说明和版本来源。
- [ ] 运行单元、集成、契约、类型与构建验证并审查。
- [ ] 完成计划归档和版本门禁。
- [ ] 更名 GitHub 仓库为 kumvjs/KuVibeAdmin、提交推送、打标签并创建正式 Release。

## 版本决策

变更集：kuvibeadmin-backend-release-20260917。基线根/core 1.1.0。预期 patch 1.1.1（品牌、验证和兼容修复；私有应用包名无公共 npm 消费者）；发现外部不兼容变更时从原始基线重新判定。完成验证后同步版本，当前不提前递增。KuVibe schema/revision 保持不变。

## 发布边界

保持既有 API、数据库和 Redis 标识兼容；不执行用户日常数据库迁移。集成测试仅使用本任务新建的隔离容器。正式发布指 GitHub 稳定 Release，不发布 private core 到 npm。
