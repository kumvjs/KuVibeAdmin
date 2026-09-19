import type { ValidationPipeOptions } from '@nestjs/common'
import {
  ArgumentMetadata,
  Injectable,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common'
// 定义一个灵活的类型：接收运行时 body，返回一个构造函数（DTO Class）
export type DtoResolverFn = (body: any) => new (...args: any[]) => any

@Injectable()
export class DiscriminatedBodyPipe extends ValidationPipe {
  constructor(
    // 核心：注入决策函数
    private readonly resolver: DtoResolverFn,
    options?: ValidationPipeOptions,
  ) {
    super({
      whitelist: true,
      transform: true,
      ...options,
    })
  }

  async transform(value: unknown, metadata: ArgumentMetadata) {
    // 依然只处理 body
    if (metadata.type !== 'body') {
      return super.transform(value, metadata)
    }

    if (!value || typeof value !== 'object') {
      throw new UnprocessableEntityException('Request body must be a valid JSON object')
    }

    // 【魔法点】：把整个 body 丢给回调函数，让用户自己的业务逻辑去决定返回哪个 DTO Class
    const TargetDtoClass = this.resolver(value)

    if (!TargetDtoClass) {
      throw new UnprocessableEntityException('Unable to resolve a valid Dto class for the given input')
    }

    // 动态篡改元数据，完美借用父类的自动化校验
    return super.transform(value, {
      ...metadata,
      metatype: TargetDtoClass,
    })
  }
}
