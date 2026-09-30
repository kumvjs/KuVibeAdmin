import { createHash } from 'node:crypto'
import { UnprocessableEntityException } from '@nestjs/common'

export const POINT_ACTIONS = ['grant', 'debit', 'freeze', 'capture', 'unfreeze', 'reverse'] as const
export type PointAction = typeof POINT_ACTIONS[number]
export type PointKind = 'paid' | 'gift'
export const POINT_PERMISSIONS = {
  READ: 'system:points:read',
  GRANT: 'system:points:grant',
  DEBIT: 'system:points:debit',
  FREEZE: 'system:points:freeze',
  CAPTURE: 'system:points:capture',
  UNFREEZE: 'system:points:unfreeze',
  REVERSE: 'system:points:reverse',
} as const

export const PG_BIGINT_MAX = 9223372036854775807n

export function positiveInteger(value: unknown, field = 'amount'): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > PG_BIGINT_MAX)
    throw new UnprocessableEntityException(`${field} 必须是 PostgreSQL bigint 范围内的正整数字符串`)
  return BigInt(value)
}

export interface PointCommand {
  userId: string
  action: PointAction
  amount: string
  businessType: string
  businessKey: string
  reason: string
  actorId: string | null
  kind?: PointKind
  referenceId?: string
  holdId?: string
  traceId?: string | null
}

export function validatePointCommand(command: PointCommand): void {
  positiveInteger(command.userId, 'userId')
  positiveInteger(command.amount)
  if (command.actorId !== null)
    positiveInteger(command.actorId, 'actorId')
  if (!POINT_ACTIONS.includes(command.action))
    throw new UnprocessableEntityException('不支持的积分动作')
  if (typeof command.businessType !== 'string' || !/^[a-z][a-z0-9_-]{0,49}$/.test(command.businessType)
    || typeof command.businessKey !== 'string' || !/^[\w:.-]{1,120}$/.test(command.businessKey)) {
    throw new UnprocessableEntityException('业务类型或幂等键格式无效')
  }
  if (typeof command.reason !== 'string' || !command.reason.trim() || command.reason.length > 500)
    throw new UnprocessableEntityException('必须提供1–500字的操作原因')
  if (command.kind !== undefined && !['paid', 'gift'].includes(command.kind))
    throw new UnprocessableEntityException('积分来源类型无效')
  if (command.action === 'reverse')
    positiveInteger(command.referenceId, 'referenceId')
  else if (command.referenceId !== undefined)
    throw new UnprocessableEntityException('仅冲正可指定原流水')
  if (['capture', 'unfreeze'].includes(command.action))
    positiveInteger(command.holdId, 'holdId')
  else if (command.holdId !== undefined)
    throw new UnprocessableEntityException('仅冻结核销或解冻可指定冻结凭证')
  if (command.kind !== undefined && command.action !== 'grant')
    throw new UnprocessableEntityException('仅发放可指定来源类型')
}

export function pointFingerprint(command: PointCommand): string {
  return createHash('sha256').update(JSON.stringify({
    userId: command.userId,
    action: command.action,
    amount: command.amount,
    reason: command.reason,
    actorId: command.actorId,
    kind: command.action === 'grant' ? command.kind ?? 'gift' : null,
    referenceId: command.referenceId ?? null,
    holdId: command.holdId ?? null,
  })).digest('hex')
}
