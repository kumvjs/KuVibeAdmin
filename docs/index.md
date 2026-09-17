---
layout: home

hero:
  name: KuVibeAdmin
  text: 面向 AI 辅助开发的管理系统后端
  tagline: 基于 KuVibe 工程协议，使用 NestJS + PostgreSQL + Redis，为 Vben Admin 提供真实的认证、权限与系统管理能力。当前版本交付后端。
  image:
    src: /logo.svg
    alt: KuVibeAdmin
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 了解当前能力
      link: /guide/overview

features:
  - title: 认证与权限底座
    details: JWT Access Token、Refresh Token 轮换、Redis 登录态、用户—角色—菜单权限模型，以及 HTTP / WebSocket 共用的 Guard。
  - title: 统一接口约定
    details: 全局参数校验、响应封装、异常格式和 traceId，为 Vben Admin 的请求适配提供稳定边界。
  - title: 实时通信基础设施
    details: Socket.IO Gateway 基类、连接会话索引、命名空间注册、房间与定向推送能力；业务 Gateway 尚待接入。
  - title: AI Agents 路线
    details: 已预留 AI 模块和 OpenAI 兼容客户端封装，多 Agent 编排、工具调用、记忆与流式协议尚未实现。
---

## 文档说明

本文档以当前仓库代码为准。标记为“规划中”或“骨架”的能力不能视为可用接口；Swagger 仍是运行时 HTTP 接口模型的补充参考。
