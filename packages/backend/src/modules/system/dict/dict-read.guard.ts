import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { HttpException, Injectable } from '@nestjs/common'

/** 每实例每用户每分钟 120 次，表最多 10000 个有效窗口；全局限流可由网关补充。 */
@Injectable()
export class DictReadGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number, until: number }>()

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: LoginUserContext }>().user
    if (!user)
      throw new HttpException('请先登录', 401)
    const now = Date.now()
    const existing = this.windows.get(user.uid)
    if (existing && existing.until > now) {
      if (++existing.count > 120)
        throw new HttpException('字典查询过于频繁，请稍后重试', 429)
      return true
    }
    if (this.windows.size >= 10000) {
      for (const [key, window] of this.windows) {
        if (window.until <= now)
          this.windows.delete(key)
      }
      if (this.windows.size >= 10000)
        throw new HttpException('字典查询繁忙，请稍后重试', 429)
    }
    this.windows.set(user.uid, { count: 1, until: now + 60_000 })
    return true
  }
}
