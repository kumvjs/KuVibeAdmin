# Vben 维护边界与前端接入修正

记录时间2026-09-30T18:33:56.248+08:00，关联原需求points-recharge-orders-plan-20260930及提交9a1e595；用户明确指出未提出登录页改造，要求撤销并将Vben最小修改原则写入Agent规范。

## 问题与决策

此前把“接入真实后端”扩展为移除登录页示例表单/验证/登录入口，这不是积分业务的必要条件，属于Agent扩大范围。用户要求优先保留上游以方便升级。本次将登录页从9a1e595父提交原样恢复，不撤销真实API适配或积分业务页面，不重置整个目录。

原billing.vitest.config.ts只负责单元测试：Vue转换、happy-dom、应用#别名和四类测试范围；不参与运行，也不是Vben或充值功能必需文件。原根Vitest已提供转换及DOM配置，没有必要重复一套。现将四个测试与配置移入playground/tests，配置继承../../vitest.config.ts，仅加应用别名/用例范围。使用标准应用级入口而非在Vben根新增模块配置；没有改上游通用Vitest、清单或锁文件，也没有新增依赖。

来源错误是Docker已有APP_CORS_ORIGINS仅列localhost:5999/5555，显式配置覆盖后端默认的双本地来源；127.0.0.1:5999因而被TrustedOriginGuard拒绝。只在compose.dev.frontend.yaml保留既有名单并追加两个精确5999来源，重建现有开发backend/frontend容器生效。不改安全守卫、不允许通配、不改生产来源或本地密钥，不销毁数据库/缓存卷。

## 上游差异审查

根AGENTS.md新增“Vben上游维护边界”，业务优先应用页面/组件/API/路由/配置覆盖和现有插槽；禁止无需求改写登录交互、共享框架、其他应用和批量格式化。必要上游改动记录需求、替代扩展为何不足、范围和升级合并影响；保留已有授权、不新增无依据的审批流程。

| 保留的应用接入位置 | 明确业务必要性与维护方式 |
| --- | --- |
| api/core/auth.ts、api/request.ts、store/auth.ts | 真实后端ResOp、Cookie刷新、Bearer退出与失效刷新恢复；在应用请求适配层做契约差异，不改共享@vben/request/@vben/stores |
| api/core/menu.ts、api/core/user.ts、preferences.ts | 真实后端RBAC菜单模式、所有已登录用户的本人业务入口/默认首页；使用应用菜单适配与配置覆盖，避免授予普通角色管理权限 |
| layouts/basic.vue | 用户要求顶部积分展示；通过现有header-right插槽挂载业务组件，仅新增import/插槽，不改共享布局实现 |
| views/system/user/list.vue | 用户管理复用需求中的积分账户跳转；只新增带权限的业务操作，不重设计原表单或表格 |
| vite.config.ts、.dockerignore及新增开发镜像 | 真实/api代理、关闭Nitro mock、BigInt ES2020与Windows只读热更新/镜像隔离；限定应用/开发配置，不改shared internal构建实现 |
| views/_core/authentication/login.vue | 此前调整不满足必要性，全部恢复；Git blob与9a1e595父提交完全一致 |

核对Vben共享packages、internal、apps及原根vitest.config.ts，相对本阶段开发前基线无差异；应用新增业务目录/测试由本项目维护。今后仍须逐需求评估，不把本表当作任意改写这些文件的授权。

## 验证

- 登录页Git blob均162398e05e8dd1925a2965a960f33925a25892a6，确认完整撤销。浏览器在用户给出的127.0.0.1地址检查原示例账号选择、滑块、登录方式、注册/找回入口均已恢复；未用自动化绕过原页面验证。
- 经真实Vite代理，以localhost:5999、127.0.0.1:5999两个Origin实际登录、刷新Cookie及Bearer退出均通过；untrusted.invalid仍403/10010。不输出账户密码、Cookie或令牌。
- 新应用测试配置最终4文件12项通过，没有配置加载警告；五个移动/新增测试文件ESLint通过。playground类型检查、最终生产构建（17.45秒）与VitePress构建通过；Git空白检查通过。
- Docker四项健康；backend/frontend重建保留原开发账号、数据库、账务记录与数据卷。截图.tmp/vben-login-restored.png与构建日志为忽略的本地产物，不提交。

## 文档与后果

更新根AGENTS.md、项目/栈上下文、当前前端文档及active需求/计划；原M7记录追加更正链接，保留历史证据。文档解释应用测试用途/命令、登录示例值不代表后端账户、两个本地入口、来源配置须up重建及生产配置边界。登录页保留上游示例交互，不宣称手机号/扫码/第三方注册等示例入口已实现后端功能。

## 版本与后续

本次修正局部语义patch，归入原完整积分充值需求，整体最高语义minor与原目标1.4.0保持。根/backend原基线均1.3.0，实际1.3.0 → 1.3.0，unchanged：完整需求渠道/生产验收仍pending，阶段修正不重复递增，不建立deferred政策。前端上游monorepo5.7.0 → 5.7.0、playground5.8.0 → 5.8.0；无清单/锁变更，docs无版本，KuVibe release0.3.3/schema2/revision未变。没有push/tag/release或已发布CHANGELOG。

此次用户指定撤销、规范和本地Origin修复已完成；四渠道真实联调及原M6生产验收保持待验，保留有未完成里程碑的active目录。对应修正提交由Git历史定位。
