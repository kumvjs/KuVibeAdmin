import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { SysUserEntity } from '#/modules/user/entities/user.entity.js'

export const CurrentUser = createParamDecorator(
  (field: keyof SysUserEntity | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>()
    const user = request?.user as SysUserEntity | undefined

    return field ? user?.[field] : user
  },
)
