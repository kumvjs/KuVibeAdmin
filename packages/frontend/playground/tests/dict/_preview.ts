import { initPreferences } from '@vben/preferences';
await initPreferences({ namespace: 'dict-disposable-preview' });
const { createApp, defineComponent, h } = await import('vue');
const { createRouter, createWebHistory, RouterView } =
  await import('vue-router');
const { registerAccessDirective } = await import('@vben/access');
const { registerLoadingDirective } = await import('@vben/common-ui');
const { providePluginsOptions } = await import('@vben/plugins');
const { initStores, useAccessStore } = await import('@vben/stores');
const { initComponentAdapter } = await import('#/adapter/component');
const { initSetupVbenForm, useVbenForm } = await import('#/adapter/form');
const { setupI18n } = await import('#/locales');
await import('@vben/styles');
await import('@vben/styles/antdv-next');
await initComponentAdapter();
await initSetupVbenForm();
providePluginsOptions({ form: { useVbenForm } });
// 独立 UI 验收夹具：不访问日常后端或写入业务库；真实 HTTP/Redis 另由后端集成测试覆盖。
const { requestClient } = await import('#/api/request');
const fixtures = [
  {
    id: '1',
    pid: null,
    name: '订单',
    code: 'order',
    value: null,
    hasChildren: true,
  },
  {
    id: '2',
    pid: '1',
    name: '订单状态',
    code: 'order.status',
    value: 'category',
    hasChildren: true,
  },
  {
    id: '3',
    pid: '2',
    name: '待支付',
    code: 'order.pending',
    value: '',
    hasChildren: false,
  },
  {
    id: '4',
    pid: null,
    name: '用户',
    code: 'user',
    value: null,
    hasChildren: false,
  },
].map((row) => ({
  ...row,
  status: 1,
  effectiveStatus: 1,
  cacheEnabled: false,
  order: 0,
  remark: null,
  createTime: '2026-10-03T00:00:00Z',
  updateTime: '2026-10-03T00:00:00Z',
}));
const audit = document.createElement('div');
audit.setAttribute('aria-label', '验收请求记录');
audit.style.cssText =
  'position:fixed;bottom:0;left:0;right:0;background:#f0f5ff;padding:6px;z-index:9999;font-size:12px;max-height:80px;overflow:auto';
document.body.append(audit);
requestClient.instance.defaults.adapter = async (config) => {
  const url = config.url ?? '';
  const method = (config.method ?? 'get').toUpperCase();
  audit.textContent += `${method} ${url} | `;
  let data: unknown;
  if (url === '/system/dict/roots')
    data = fixtures.filter((row) => row.pid === null);
  else if (url === '/system/dict/list') data = fixtures;
  else if (url.endsWith('/children'))
    data = fixtures.filter((row) => row.pid === url.split('/').at(-2));
  else if (method === 'GET')
    data = fixtures.find((row) => row.id === url.split('/').at(-1));
  else if (method === 'PUT') {
    const id = url.endsWith('/status')
      ? url.split('/').at(-2)
      : url.split('/').at(-1);
    const row = fixtures.find((node) => node.id === id);
    if (row)
      Object.assign(
        row,
        typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      );
    data = true;
  } else if (method === 'POST') {
    const body =
      typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const row = {
      ...fixtures[0]!,
      ...body,
      id: String(fixtures.length + 1),
      hasChildren: false,
    };
    fixtures.push(row);
    data = row;
  }
  const byId = new Map(fixtures.map((node) => [node.id, node]));
  for (const node of fixtures) {
    let parent: typeof node | undefined = node;
    let enabled = true;
    const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      enabled = enabled && parent.status === 1;
      parent = parent.pid ? byId.get(parent.pid) : undefined;
    }
    node.effectiveStatus = enabled ? 1 : 0;
    node.hasChildren = fixtures.some((child) => child.pid === node.id);
  }
  return {
    data: { code: 0, data, message: 'ok', success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
const { default: List } = await import('#/views/system/dict/list.vue');
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: List }],
});
const app = createApp(defineComponent(() => () => h(RouterView)));
registerLoadingDirective(app, { loading: 'loading', spinning: 'spinning' });
await setupI18n(app);
await initStores(app, { namespace: 'dict-disposable-preview' });
const access = useAccessStore();
access.setAccessToken('dict-preview');
access.setAccessCodes([
  'system:dict:list',
  'system:dict:create',
  'system:dict:update',
  'system:dict:disable',
]);
registerAccessDirective(app);
app.use(router);
const { VueQueryPlugin } = await import('@tanstack/vue-query');
app.use(VueQueryPlugin);
app.mount('#app');
const { unmountGlobalLoading } = await import('@vben/utils');
unmountGlobalLoading();
