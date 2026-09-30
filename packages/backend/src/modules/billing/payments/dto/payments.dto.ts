import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches, MaxLength } from 'class-validator'

export class PaymentPrepareDto {
  @ApiProperty({ description: '订单bigint标识', example: '100' })
  orderId: string

  @ApiProperty({ enum: ['queued', 'starting', 'ready', 'cancelled'] })
  status: string

  @ApiProperty({ description: 'ready时返回渠道App签名参数或扫码codeUrl；其他状态为null', type: 'object', additionalProperties: { type: 'string' }, nullable: true })
  parameters: Record<string, string> | null
}

export class AppleReceiptDto {
  @ApiProperty({ description: 'StoreKit transactionId，服务端另行查单并验JWS' })
  @IsString()
  @Matches(/^\d{1,64}$/)
  transactionId: string
}

export class GoogleReceiptDto {
  @ApiProperty({ description: 'Google Play purchaseToken，仅通过HTTPS提交，不放在URL中' })
  @IsString()
  @MaxLength(4096)
  @Matches(/^[\w.:-]{1,4096}$/)
  purchaseToken: string
}

export class ReceiptAcceptedDto {
  @ApiProperty({ description: '持久化验真任务标识' })
  inboxId: string

  @ApiProperty({ enum: ['pending', 'done', 'review'] })
  status: string
}
