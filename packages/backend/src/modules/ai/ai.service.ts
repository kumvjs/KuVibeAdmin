import { Inject, Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { APIPromise } from 'openai/core/api-promise'
import { Stream } from 'openai/streaming'
import { CreateAiDto } from './dto/create-ai.dto.js'
import { UpdateAiDto } from './dto/update-ai.dto.js'

@Injectable()
export class AiService {
  private openAi: OpenAI
  constructor(
  ) {
    this.openAi = new OpenAI(
      {
        apiKey: `apiKey`,
        // baseURL: `https://${baiLianConfig.workSpaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`,
        baseURL: `https://dashscope.aliyuncs.com/compatible-mode/v1`,
      },
    )
  }
  /**
   * 封装的 Completion 方法
   */
  // 重载 1：当 stream 为 true 时，返回 Stream 包装的 Chunk
  completion(
    params: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
    op?: OpenAI.RequestOptions
  ): APIPromise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>

  // 重载 2：当 stream 为 false 或未传时，返回普通的 ChatCompletion
  completion(
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    op?: OpenAI.RequestOptions
  ): APIPromise<OpenAI.Chat.Completions.ChatCompletion>

  // 重载 3：兜底的通用声明
  completion(
    params: OpenAI.Chat.ChatCompletionCreateParams,
    op?: OpenAI.RequestOptions
  ): APIPromise<OpenAI.Chat.Completions.ChatCompletion> | APIPromise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>

  // 具体实现逻辑
  completion(
    params: OpenAI.Chat.ChatCompletionCreateParams,
    op?: OpenAI.RequestOptions,
  ) {
    // 转发给 openai 客户端，内部会根据 params.stream 自动匹配重载
    return this.openAi.chat.completions.create(params, op)
  }
}
