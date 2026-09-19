# 附件与上传策略权限统一归组

时间：2026-09-18T07:07:43+08:00。

用户明确上传与附件属于同一模块，只增加一个附件管理二级目录；不创建独立上传策略目录。

新增 SystemAttachment（catalog，/system/attachment）挂在 System 下，AttachmentList/Read/Delete、UploadPolicyRead/Write 全部挂在该目录下。保留现有权限码，默认 user 无管理授权。目录用于菜单及角色授权树分组，未虚构前端页面组件。

旧版直接挂在 System 下且其他种子字段匹配的五项权限，在 setup 的同一事务内仅更新 pid；保留 ID、元数据和角色关联。人工调整到其他父级、停用、软删除或字段冲突仍报错回滚。没有表结构或 API 改动，不修改历史迁移，不操作业务数据库。

验证：隔离 PostgreSQL 集成通过，覆盖新目录、全部五项原地归组、角色关联保留、默认权限清理、重复执行与非预期父级冲突；pnpm typecheck、构建、改动文件 ESLint 和 git diff --check 通过。未进行实际前端浏览器验收。更新快速开始和专项验证说明，v2 活动规划保留。

版本决定：attachment-menu，patch / bumped，根 package.json 与 packages/backend/package.json 统一 1.2.1 → 1.2.2；修复权限归组并兼容旧初始化数据。CHANGELOG 同步，无依赖变化，锁文件无需更新，KuVibe schema/revision 不变。未提交或发布。
