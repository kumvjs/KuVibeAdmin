import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ description: '手机号/邮箱/账号' })
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  username: string

  @ApiProperty({ description: '密码', example: 'a123456' })
  @IsString()
  // @Matches(/^\S*(?=\S{6})(?=\S*\d)(?=\S*[A-Z])\S*$/i)
  @MinLength(6)
  @MaxLength(128)
  password: string

  /*  @ApiProperty({ description: '验证码标识' })
  @IsString()
  captchaId: string */

  /*  @ApiProperty({ description: '用户输入的验证码' })
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  verifyCode: string */
}
export class LoginTokenResponseDto {
  @ApiProperty({ description: 'JWT身份Token' })
  accessToken: string
}
