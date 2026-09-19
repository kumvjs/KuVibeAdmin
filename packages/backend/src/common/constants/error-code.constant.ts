import { HttpStatus } from '@nestjs/common'

export interface ErrorCodeItem {
  code: number
  message: string
  httpStatus?: HttpStatus
  description?: string
}
export type ErrorCodes = Record<string, ErrorCodeItem>
export const ERROR_CODES = {
  // ─── 通用 (00xxx) ────────────────────────────

  SUCCESS: {
    code: 0,
    message: 'success',
  },
  UNPROCESSABLE_ENTITY: {
    code: 422,
    message: 'UNPROCESSABLE_ENTITY',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  ERROR: {
    code: 500,
    message: '系统错误',
  },

  // ─── 认证模块 (10xxx) ────────────────────
  AUTH_TOKEN_INVALID: {
    code: 401,
    message: '登录已失效，请重新登录',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },
  AUTH_TOKEN_EXPIRED: {
    code: 10002,
    message: '登录已过期，请重新登录',
  },
  AUTH_TOKEN_MISSING: {
    code: 10003,
    message: 'token 缺失',
  },
  AUTH_UNAUTHORIZED: {
    code: 10004,
    message: '无权限',
    httpStatus: HttpStatus.FORBIDDEN,
  },
  AUTH_FORBIDDEN: {
    code: 10005,
    message: '禁止访问',
  },
  AUTH_LOGGED_IN_ELSEWHERE: {
    code: 10006,
    message: '账号已在其他地方登录',
  },
  AUTH_CAPTCHA_CODE_ERROR: {
    code: 10007,
    message: '验证码填写有误',
  },
  AUTH_REFRESH_TOKEN_EXPIRED: {
    code: 10008,
    message: 'refreshToken 已过期',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },
  AUTH_REFRESH_TOKEN_MISSING: {
    code: 10009,
    message: 'refreshToken 缺失',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },
  AUTH_ORIGIN_FORBIDDEN: {
    code: 10010,
    message: '请求来源不受信任',
    httpStatus: HttpStatus.FORBIDDEN,
  },

  // ─── 用户模块 (20xxx) ────────────────────

  USER_NOT_FOUND: {
    code: 20001,
    message: '用户不存在',
  },
  USER_ALREADY_EXISTS: {
    code: 20002,
    message: '用户已存在',
  },
  USER_PASSWORD_ERROR: {
    code: 20003,
    message: '账号或密码错误',
  },
  USER_ACCOUNT_DISABLED: {
    code: 20004,
    message: '账号已被禁用，请联系管理员',
  },
  USER_PASSWORD_VERSION_ERROR: {
    code: 20005,
    message: '密码变更请重新登录',
    httpStatus: HttpStatus.UNAUTHORIZED,
  },

  // ─── 话术库模块 (30xxx) ────────────────────

  SCRIPT_LIBRARY_NOT_FOUND: {
    code: 30404,
    message: '未找到对应话术库',
  },

  // ─── 房间模块 (40xxx) ────────────────────

  LIVE_ROOM_NOT_FOUND: {
    code: 40404,
    message: '未找到直播间',
  },

  // ─── 工具类模块 (100xxx) ────────────────────────
  TOOL_GENERATE_RANDOM_STRING_LENGTH_ERROR: {
    code: 100002,
    message: '长度有误',
  },
  TOOL_GENERATE_RANDOM_STRING_MISSING_LENGTH: {
    code: 100001,
    message: '至少提供 minLength 或 maxLength 中的一个',
  },

} as const
