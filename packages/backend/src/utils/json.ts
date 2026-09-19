/**
 * 安全解析 JSON 字符串。
 * 解析失败时返回 fallback，而非抛出异常。
 *
 * @param value - 待解析的 JSON 字符串
 * @returns 解析成功返回对应类型值，失败返回 fallback
 */
export function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}
