import { SysUserEntity } from '#/modules/user/entities/user.entity.js'

export class AccessTokenDto {
  value: string
  user: SysUserEntity
  expired_at: Date
}
