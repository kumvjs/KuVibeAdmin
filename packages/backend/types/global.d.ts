declare global {
  interface AuthUser {
    sub?: string
    uid: string
    /** jwtUuid */
    jwtUuid: uuid
    pv: number
    /** 过期时间 */
    exp?: number
    /** 签发时间 */
    iat?: number
  }
  /**
   * 终极融合体：当前请求的登录用户上下文 (Request.user & CLS)
   * 完美融合了【业务用户信息】与【当前 Token 的特征元数据】
   */
  interface LoginUserContext {
    /** 快捷获取当前用户 ID (字符串型) */
    uid: string
    /** 快捷获取当前用户权限角色 */
    roleCodes: string[]
    /** 完整的业务用户信息（来自 Redis 缓存） */
    user: SysUserEntity
    /** 当前正在使用的 Token 元数据信息 */
    tokenInfo: AuthUser
  }
}

export { }
