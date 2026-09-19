import { SetMetadata } from '@nestjs/common'

export const PUBLIC_KEY = '__public_key__'

/**
 * 当接口不需要检测用户登录时添加该装饰器
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true)
