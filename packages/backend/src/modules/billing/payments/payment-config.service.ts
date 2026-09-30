import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export interface WechatSettings { enabled: boolean, merchantId: string, appId: string, nativeAppId?: string, certificateSerial: string, privateKeyFile: string, apiV3KeyFile: string, platformKeys: Record<string, string>, notifyUrl: string }
export interface AlipaySettings { enabled: boolean, appId: string, sellerId: string, environment: 'sandbox' | 'production', privateKeyFile: string, publicKeyFile: string, keyType: 'PKCS1' | 'PKCS8', notifyUrl: string }
export interface AppleSettings { enabled: boolean, bundleId: string, environment: 'sandbox' | 'production', appAppleId?: number, issuerId: string, keyId: string, privateKeyFile: string, rootCertificateFiles: string[] }
export interface GoogleSettings { enabled: boolean, packageName: string, environment: 'sandbox' | 'production', credentialsFile: string, pushAudience: string, pushServiceAccountEmail: string }
export interface PaymentSettings { wechat?: WechatSettings, alipay?: AlipaySettings, apple?: AppleSettings[], google?: GoogleSettings[], dataKeyFile?: string, dataKeyId?: string }

@Injectable()
export class PaymentConfigService {
  readonly settings: PaymentSettings
  private readonly directory: string

  constructor() {
    const path = process.env.BILLING_CONFIG_FILE?.trim()
    this.directory = path ? dirname(resolve(path)) : process.cwd()
    this.settings = path ? JSON.parse(readFileSync(path, 'utf8')) : {}
    if (!this.settings || typeof this.settings !== 'object' || Array.isArray(this.settings))
      throw new Error('支付配置须为JSON对象')
  }

  file(path: string): Buffer {
    if (typeof path !== 'string' || !path.trim())
      throw new Error('支付配置缺少密钥/证书文件路径')
    return readFileSync(resolve(this.directory, path))
  }

  require<T extends { enabled: boolean }>(value: T | undefined): T {
    if (value?.enabled !== true)
      throw new ServiceUnavailableException('该支付渠道尚未配置或启用')
    return value
  }

  callback(url: string): string {
    const target = new URL(url)
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || url.length > 255)
      throw new Error('支付回调必须为不带查询串的HTTPS地址')
    return target.href
  }

  dataKey() {
    const key = Buffer.from(this.file(this.settings.dataKeyFile!).toString('utf8').trim(), 'base64')
    if (key.length !== 32 || !/^[\w-]{1,50}$/.test(this.settings.dataKeyId ?? ''))
      throw new Error('持久化内购凭据需要独立32字节密钥和keyId')
    return { key, id: this.settings.dataKeyId! }
  }
}
