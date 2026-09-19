import type { PlaygroundTableItemDto, PlaygroundTableQueryDto, PlaygroundTableResponseDto } from './dto/playground.dto.js'
import { Injectable } from '@nestjs/common'
import { PLAYGROUND_TABLE_FIXTURES } from './playground-fixtures.js'

@Injectable()
export class PlaygroundService {
  getTable(query: PlaygroundTableQueryDto): PlaygroundTableResponseDto {
    const items = [...PLAYGROUND_TABLE_FIXTURES]
    if (query.sortBy) {
      const sortBy = query.sortBy
      const direction = query.sortOrder === 'desc' ? -1 : 1
      items.sort((left, right) => {
        const result = this.compare(left[sortBy], right[sortBy])
        return result === 0 ? left.id.localeCompare(right.id) : result * direction
      })
    }

    const offset = (query.page - 1) * query.pageSize
    return {
      items: items.slice(offset, offset + query.pageSize),
      total: items.length,
    }
  }

  private compare(left: PlaygroundTableItemDto[keyof PlaygroundTableItemDto], right: PlaygroundTableItemDto[keyof PlaygroundTableItemDto]): number {
    if (typeof left === 'number' && typeof right === 'number')
      return left - right
    if (typeof left === 'boolean' && typeof right === 'boolean')
      return left === right ? 0 : left ? 1 : -1

    const leftValue = Array.isArray(left) ? left.join(',') : String(left)
    const rightValue = Array.isArray(right) ? right.join(',') : String(right)
    const leftNumber = Number(leftValue)
    const rightNumber = Number(rightValue)
    if (leftValue !== '' && rightValue !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
      return leftNumber - rightNumber
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
  }
}
