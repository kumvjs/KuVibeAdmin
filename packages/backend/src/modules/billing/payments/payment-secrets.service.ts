import type { SealedSecret } from './entities/payment-inbox.entity.js'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { PaymentConfigService } from './payment-config.service.js'

@Injectable()
export class PaymentSecretsService {
  constructor(private readonly config: PaymentConfigService) {}

  seal(value: string, context: string): SealedSecret {
    const { key, id } = this.config.dataKey()
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(context))
    return { keyId: id, nonce: nonce.toString('base64'), ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64') }
  }

  open(value: SealedSecret, context: string) {
    const { key, id } = this.config.dataKey(value.keyId)
    if (value.keyId !== id)
      throw new Error('内购凭据密钥版本不匹配，保留待处理任务')
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.nonce, 'base64'))
    cipher.setAAD(Buffer.from(context))
    cipher.setAuthTag(Buffer.from(value.tag, 'base64'))
    return Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]).toString('utf8')
  }
}
