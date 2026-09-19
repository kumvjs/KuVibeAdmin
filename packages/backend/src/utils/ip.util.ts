import type { FastifyRequest } from 'fastify'
import type { IncomingMessage } from 'node:http'
import axios from 'axios'
import { COMMON_LOGGER } from '#/common/constants/logger.constant.js'

/**
 * 从请求中提取客户端 IP。
 *
 * 优先依赖 req.ip，若部署在可信反向代理后且已配置 Fastify trustProxy，
 * Fastify 会自动安全地解析 XFF 并处理伪造问题。
 */
export function getIp(request: FastifyRequest | IncomingMessage): string | undefined {
  let ip: string | undefined

  // 1. 优先使用 Fastify 特有属性（开启 trustProxy 后此值最安全可靠）
  const req = request as FastifyRequest
  if (req.ip) {
    ip = req.ip
  }

  // 2. 降级方案：若未挂载 req.ip，则手动解析 header
  if (!ip) {
    const headers = request.headers

    // Node.js/Fastify 会将所有 header key 转为小写
    const xff = headers['x-forwarded-for']
    if (xff) {
      const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim()
      if (first)
        ip = first
    }

    if (!ip) {
      const xri = headers['x-real-ip']
      if (xri) {
        ip = (Array.isArray(xri) ? xri[0] : xri).trim() || undefined
      }
    }
  }

  // 3. 最终兜底：TCP 层直连 IP
  if (!ip) {
    const socket = (request as any).socket ?? (request as any).raw?.socket
    ip = socket?.remoteAddress
  }

  // 4. 清洗 IPv6 映射的 IPv4 前缀 (e.g., ::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7)
  }

  return ip
}
/**
 * 判断 IP 是否属于内网/回环地址。
 * 支持 IPv4、IPv4-mapped IPv6（::ffff:x.x.x.x）、IPv6 回环（::1）。
 */
export function isLAN(ip: string): boolean {
  if (!ip)
    return false

  const s = ip.trim().toLowerCase()

  // IPv6 回环
  if (s === '::1')
    return true

  // IPv4-mapped IPv6: ::ffff:192.168.1.1
  const v4mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const v4 = v4mapped ? v4mapped[1] : s

  const parts = v4.split('.')
  if (parts.length !== 4)
    return false

  const octets = parts.map(p => Number.parseInt(p, 10))
  if (octets.some(n => Number.isNaN(n) || n < 0 || n > 255))
    return false

  const [a, b] = octets

  return (
    a === 127 // 127.0.0.0/8  loopback
    || a === 10 // 10.0.0.0/8   private
    || (a === 172 && b >= 16 && b <= 31) // 172.16.0.0/12 private
    || (a === 192 && b === 168) // 192.168.0.0/16 private
  )
}
export async function getIpAddress(ip: string) {
  if (isLAN(ip))
    return '内网IP'
  try {
    let { data } = await axios.get(
      `https://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`,
      { responseType: 'arraybuffer' },
    )
    data = new TextDecoder('gbk').decode(data)
    data = JSON.parse(data)
    return data.addr.trim().split(' ').at(0)
  }
  catch (error) {
    COMMON_LOGGER.error(error)
    return ''
  }
}
