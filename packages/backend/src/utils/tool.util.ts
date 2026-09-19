import { customAlphabet, nanoid } from 'nanoid'
import { ERROR_CODES } from '#/common/constants/error-code.constant.js'
import { BusinessException } from '#/common/exceptions/business.exception.js'

export interface RandomStringOptions {
  minLength: number
  maxLength?: number
  length?: number // 直接指定长度（优先级最高）
  alphabet?: string // 自定义字符集
}

export function generateUUID(size: number = 21): string {
  return nanoid(size)
}
/**
 * 生成随机字符串
 *
 * 规则：
 * 1. 如果只传 minLength => 固定长度
 * 2. 如果传 min/max => 在范围内随机
 */
export function generateRandomString(options: RandomStringOptions): string {
  let {
    minLength,
    maxLength,
    alphabet = '1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
  } = options

  // 必须至少提供一个
  if (minLength == null && maxLength == null) {
    throw new BusinessException(ERROR_CODES.TOOL_GENERATE_RANDOM_STRING_MISSING_LENGTH)
  }

  // 归一化区间
  const min = minLength ?? maxLength!
  const max = maxLength ?? minLength!

  // 防御性校验（关键）
  if (min <= 0 || max <= 0) {
    throw new BusinessException(ERROR_CODES.TOOL_GENERATE_RANDOM_STRING_MISSING_LENGTH)
  }

  if (min > max) {
    throw new BusinessException(ERROR_CODES.TOOL_GENERATE_RANDOM_STRING_LENGTH_ERROR)
  }
  // 1. 确定最终长度
  let finalLength = minLength
  if (!maxLength) {
    maxLength = minLength
  }

  finalLength = Math.floor(Math.random() * (max - min + 1)) + min

  // 2. nanoid 生成器
  const customNanoid = customAlphabet(alphabet, finalLength)

  return customNanoid()
}
