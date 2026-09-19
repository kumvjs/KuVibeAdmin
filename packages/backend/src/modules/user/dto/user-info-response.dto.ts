import { ApiProperty } from '@nestjs/swagger'

export class UserInfoResponseDto {
  @ApiProperty({ description: '用户 ID', type: String })
  userId: string

  @ApiProperty({ description: '账号' })
  username: string

  @ApiProperty({ description: '用户昵称' })
  realName: string

  @ApiProperty({ description: '头像 URL' })
  avatar: string

  @ApiProperty({ description: '登录后首页路径' })
  homePath: string

  @ApiProperty({ description: '用户描述' })
  desc: string

  @ApiProperty({ description: '角色 code 列表', type: [String] })
  roles: string[]
}
