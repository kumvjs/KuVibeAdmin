import { SetMetadata } from '@nestjs/common'
import { PERMISSION_KEY } from '../auth.constant.js'

/**
 * 权限装饰器 - 用于标记需要的权限
 * @param permissions 权限码或权限码数组
 * @example
 * @RequirePermissions('system:user:create')
 * @RequirePermissions(['system:user:create', 'system:user:update'])
 */
export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(PERMISSION_KEY, permissions.length === 1 ? permissions[0] : permissions)
}
