import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 获取用户所有菜单
 */
export async function getAllMenusApi() {
  const menus =
    await requestClient.get<RouteRecordStringComponent[]>('/menu/all');
  // 本人业务接口对所有已登录用户开放，与系统管理授权分开。
  return [
    ...menus,
    {
      name: 'AccountCenter',
      path: '/account',
      component: 'BasicLayout',
      meta: { title: '我的账户', icon: 'lucide:wallet', order: -10 },
      children: [
        {
          name: 'AccountPoints',
          path: '/account/points',
          component: '/account/points',
          meta: { title: '我的积分', icon: 'lucide:coins' },
        },
        {
          name: 'AccountRecharge',
          path: '/account/recharge',
          component: '/account/recharge',
          meta: { title: '充值中心', icon: 'lucide:credit-card' },
        },
        {
          name: 'AccountOrders',
          path: '/account/orders',
          component: '/account/orders',
          meta: { title: '历史订单', icon: 'lucide:receipt' },
        },
      ],
    },
  ];
}
