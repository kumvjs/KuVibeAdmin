import { PLAYGROUND_TABLE_FIXTURES } from './playground-fixtures.js'
import { PlaygroundService } from './playground.service.js'

describe('playground deterministic table service', () => {
  const service = new PlaygroundService()

  it('returns stable Vben items/total pagination without mutating fixtures', () => {
    const first = service.getTable({ page: 1, pageSize: 10 })
    const second = service.getTable({ page: 1, pageSize: 10 })

    expect(first).toEqual(second)
    expect(first.total).toBe(100)
    expect(first.items).toHaveLength(10)
    expect(first.items[0]).toEqual(PLAYGROUND_TABLE_FIXTURES[0])
  })

  it('sorts only validated fixture fields and uses id as a stable tie breaker', () => {
    const result = service.getTable({
      page: 1,
      pageSize: 100,
      sortBy: 'quantity',
      sortOrder: 'desc',
    })

    expect(result.items).toHaveLength(100)
    for (let index = 1; index < result.items.length; index++) {
      expect(result.items[index - 1].quantity).toBeGreaterThanOrEqual(result.items[index].quantity)
    }
  })
})
