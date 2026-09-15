import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Nest AI Boot',
  description: 'NestJS 12、PostgreSQL、Redis、WebSocket 与 RBAC 后端框架文档',
  cleanUrls: true,
  lastUpdated: true,
  head: [['meta', { name: 'theme-color', content: '#2563eb' }]],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Nest AI Boot',
    nav: [
      { text: '指南', link: '/guide/overview' },
      { text: '核心模块', link: '/modules/auth-rbac' },
      { text: 'WebSocket', link: '/modules/websocket' },
      { text: 'Vben 对接', link: '/frontend/vben' },
      { text: 'API', link: '/reference/api' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '项目概览', link: '/guide/overview' },
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '配置说明', link: '/guide/configuration' },
        ],
      },
      {
        text: '架构',
        items: [
          { text: '请求处理链路', link: '/architecture/request-lifecycle' },
        ],
      },
      {
        text: '核心模块',
        items: [
          { text: '认证与 RBAC', link: '/modules/auth-rbac' },
          { text: '数据与缓存', link: '/modules/data-cache' },
          { text: '系统附件', link: '/modules/attachments' },
          { text: 'WebSocket', link: '/modules/websocket' },
          { text: 'AI Agents', link: '/modules/ai-agents' },
        ],
      },
      {
        text: '集成与参考',
        items: [
          { text: 'Vben Admin 对接', link: '/frontend/vben' },
          { text: 'HTTP API', link: '/reference/api' },
        ],
      },
    ],
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    search: { provider: 'local' },
    socialLinks: [],
    footer: {
      message: '面向 Vben Admin 与 AI Agents 场景的 NestJS 后端基础工程',
      copyright: 'Nest AI Boot',
    },
  },
})
