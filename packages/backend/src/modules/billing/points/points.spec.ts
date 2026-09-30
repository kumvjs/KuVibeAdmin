import type { PointCommand } from './points.types.js'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { PERMISSION_KEY } from '#/modules/auth/auth.constant.js'
import { PointGrantDto, PointMutationDto } from './dto/points.dto.js'
import { PointsController, SystemPointsController } from './points.controller.js'
import { POINT_PERMISSIONS, pointFingerprint, positiveInteger, validatePointCommand } from './points.types.js'

const command: PointCommand = { userId: '1', action: 'grant', amount: '10', businessType: 'manual_grant', businessKey: 'test', reason: '测试业务凭证', actorId: '2' }

describe('积分输入与权限边界', () => {
  it('bigint保持精度且拒绝浮点、负数、零、前导零及越界', () => {
    expect(positiveInteger('9007199254740993')).toBe(9007199254740993n)
    expect(positiveInteger('9223372036854775807')).toBe(9223372036854775807n)
    for (const value of ['0', '-1', '1.5', '01', '9223372036854775808', 10, null])
      expect(() => positiveInteger(value)).toThrow()
  })

  it('重试哈希忽略trace但包含操作者、内容和默认来源', () => {
    expect(pointFingerprint(command)).toBe(pointFingerprint({ ...command, traceId: 'retry', kind: 'gift' }))
    for (const change of [{ amount: '11' }, { actorId: '3' }, { reason: '不同凭证' }, { kind: 'paid' as const }])
      expect(pointFingerprint({ ...command, ...change })).not.toBe(pointFingerprint(command))
  })

  it('拒绝模糊操作或不匹配的凭证', () => {
    for (const change of [{ reason: ' ' }, { kind: null }, { holdId: '1' }, { action: 'capture' }, { action: 'reverse' }, { businessKey: '含空格 key' }])
      expect(() => validatePointCommand({ ...command, ...change } as PointCommand)).toThrow()
  })

  it('dTO不将金额数字自动转成字符串，null来源不表示缺省', () => {
    expect(validateSync(plainToInstance(PointMutationDto, { amount: 10, idempotencyKey: 'test', reason: '测试' }))).not.toHaveLength(0)
    expect(validateSync(plainToInstance(PointGrantDto, { amount: '10', idempotencyKey: 'test', reason: '测试', kind: null }))).not.toHaveLength(0)
    expect(validateSync(plainToInstance(PointGrantDto, { amount: '10', idempotencyKey: 'test', reason: '测试' }))).toHaveLength(0)
  })

  it('每种管理写操作有独立权限，用户查询仅使用登录身份', async () => {
    const writes = ['grant', 'debit', 'freeze', 'capture', 'unfreeze', 'reverse'] as const
    for (const action of writes)
      expect(Reflect.getMetadata(PERMISSION_KEY, SystemPointsController.prototype[action])).toBe(POINT_PERMISSIONS[action.toUpperCase() as keyof typeof POINT_PERMISSIONS])
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemPointsController.prototype.account)).toBe(POINT_PERMISSIONS.READ)
    const received: string[] = []
    const controller = new PointsController({
      account: async (id: string) => {
        received.push(id)
        return {}
      },
    } as any)
    await controller.account({ uid: '100' } as LoginUserContext)
    expect(received).toEqual(['100'])
  })
})
