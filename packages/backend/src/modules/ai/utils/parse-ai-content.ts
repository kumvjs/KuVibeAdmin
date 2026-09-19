import { Logger } from '@nestjs/common'

/**
 * 提取并清洗 JSON 的私有方法（职责单一）
 */
export function parseAiContent<T>(content: string): Partial<T> | null {
  let cleanContent = content

  // 清洗 Markdown 标签
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```json\s*/i, '').replace(/```$/, '').trim()
  }

  try {
    return JSON.parse(cleanContent)
  }
  catch (parseError) {
    Logger.warn('标准 JSON 解析失败，尝试正则容错修复...')
    try {
      const sanitizedContent = cleanContent
        .replace(/,(\s*[}\]])/g, '$1') // 移除末尾多余逗号
        .replace(/[\u0000-\u001F]/g, '') // 移除控制字符
      return JSON.parse(sanitizedContent)
    }
    catch (retryError) {
      return null
    }
  }
}
