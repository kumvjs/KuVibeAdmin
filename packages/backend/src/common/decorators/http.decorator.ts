import type { ExecutionContext } from '@nestjs/common'

import type { FastifyRequest } from 'fastify'
import { createParamDecorator } from '@nestjs/common'
import { getIp } from '#/utils/index.js'

/**
 * 快速获取IP
 */
export const GetIp = createParamDecorator((_, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<FastifyRequest>()
  return getIp(request)
})
