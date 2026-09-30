import type { Channel, ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { connect } from 'amqplib'

/** 数据库保存业务真源，消息只携带 outbox ID，不携带渠道响应和账户资料。 */
@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name)
  private connection?: ChannelModel
  private publisher?: ConfirmChannel
  private consumer?: Channel
  private connecting = false
  private stopped = false
  private handler?: (id: string) => Promise<void>
  private active = new Set<Promise<void>>()
  private attempts = 0
  private retryAt = 0

  constructor(private readonly config: ConfigService) {}

  get enabled() { return this.config.get<string | boolean>('RABBITMQ_ENABLED', false) === true || this.config.get('RABBITMQ_ENABLED') === 'true' }
  get queue() { return this.config.get<string>('RABBITMQ_QUEUE', 'kuvibe.billing') }
  assertReady() {
    if (!this.enabled)
      throw new Error('rabbitmq_disabled')
    if (!this.publisher)
      throw new Error('rabbitmq_unavailable')
  }

  async subscribe(handler: (id: string) => Promise<void>) {
    this.handler = handler
    await this.reconnect()
  }

  @Cron('*/5 * * * * *', { name: 'rabbitmq-reconnect', waitForCompletion: true })
  async reconnect() {
    if (!this.enabled || this.stopped || this.connecting || this.connection || Date.now() < this.retryAt)
      return
    this.connecting = true
    let connection: ChannelModel | undefined
    try {
      connection = await connect({
        hostname: this.config.get<string>('RABBITMQ_HOST', 'localhost'),
        port: Number(this.config.get('RABBITMQ_PORT', 5672)),
        username: this.config.get<string>('RABBITMQ_USERNAME'),
        password: this.config.get<string>('RABBITMQ_PASSWORD'),
        vhost: this.config.get<string>('RABBITMQ_VHOST', '/'),
        heartbeat: 30,
      }, { timeout: 10000 })
      if (this.stopped) {
        await connection.close()
        return
      }
      connection.on('error', () => this.logger.warn('RabbitMQ 连接异常，待恢复'))
      connection.on('close', () => {
        if (this.connection === connection) {
          this.connection = undefined
          this.publisher = undefined
          this.consumer = undefined
        }
      })
      const publisher = await connection.createConfirmChannel()
      publisher.on('error', () => this.logger.warn('RabbitMQ 发布通道异常'))
      publisher.on('close', () => {
        void connection?.close().catch(() => {})
      })
      await publisher.assertQueue(this.queue, { durable: true, arguments: { 'x-max-length': 10000, 'x-overflow': 'reject-publish' } })
      const consumer = await connection.createChannel()
      consumer.on('error', () => this.logger.warn('RabbitMQ 消费通道异常'))
      consumer.on('close', () => {
        void connection?.close().catch(() => {})
      })
      const prefetch = Number(this.config.get('RABBITMQ_PREFETCH', 5))
      await consumer.prefetch(prefetch)
      this.connection = connection
      this.publisher = publisher
      this.consumer = consumer
      if (this.handler) {
        await consumer.consume(this.queue, (message) => {
          if (!message) {
            void connection?.close().catch(() => {})
            return
          }
          // 旧连接的 handler 可能尚未完成，进程级上限必须覆盖重连后的新通道。
          // 不消耗 outbox 领取预算；持久化待办在下一次定时投递时恢复。
          if (this.stopped || this.active.size >= prefetch) {
            try {
              consumer.nack(message, false, false)
            }
            catch {}
            return
          }
          const work = this.consume(consumer, message)
          this.active.add(work)
          void work.finally(() => this.active.delete(work))
        }, { noAck: false })
      }
      this.attempts = 0
    }
    catch {
      this.connection = undefined
      this.publisher = undefined
      this.consumer = undefined
      await connection?.close().catch(() => {})
      this.retryAt = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(++this.attempts, 6))
      this.logger.warn('RabbitMQ 暂不可用，数据库 outbox 保留待投递任务')
    }
    finally { this.connecting = false }
  }

  private async consume(channel: Channel, message: ConsumeMessage) {
    try {
      const id = message.content.toString('utf8')
      if (!/^[1-9]\d{0,18}$/.test(id)) {
        channel.nack(message, false, false)
        return
      }
      await this.handler!(id)
      channel.ack(message)
    }
    catch {
      // 数据库故障不形成高速 requeue；outbox 定时投递并保留领域重试预算。
      try {
        channel.nack(message, false, false)
      }
      catch {}
      this.logger.warn('账务消息处理未完成，等待数据库 outbox 补偿')
    }
  }

  async publish(id: string) {
    if (!this.enabled)
      throw new Error('rabbitmq_disabled')
    const channel = this.publisher
    if (!channel)
      throw new Error('rabbitmq_unavailable')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('rabbitmq_confirm_timeout')), 10000)
      channel.sendToQueue(this.queue, Buffer.from(id), { persistent: true, contentType: 'text/plain', messageId: id }, (error) => {
        clearTimeout(timer)
        if (error)
          reject(new Error('rabbitmq_publish_failed'))
        else resolve()
      })
    })
  }

  async onModuleDestroy() {
    this.stopped = true
    await this.connection?.close().catch(() => {})
    await Promise.allSettled(this.active)
  }
}
