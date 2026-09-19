import { SetMetadata } from '@nestjs/common'

export const SKIP_RESPONSE_TRANSFORM = Symbol('skip-response-transform')

/**
 * 当不需要转换成基础返回格式时添加该装饰器
 */
export function SkipResponseTransform() {
  return SetMetadata(SKIP_RESPONSE_TRANSFORM, true)
}
