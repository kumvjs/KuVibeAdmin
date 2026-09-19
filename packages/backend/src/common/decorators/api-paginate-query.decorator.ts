// decorators/api-paginate-query.decorator.ts
import { applyDecorators } from '@nestjs/common'
import { ApiQuery } from '@nestjs/swagger'

export function ApiPaginateQuery() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
    ApiQuery({ name: 'sortBy', required: false, type: String, isArray: true, example: 'id:DESC', description: '格式: field:ASC|DESC' }),
    ApiQuery({ name: 'searchBy', required: false, type: String, isArray: true, description: '指定搜索字段' }),
    ApiQuery({ name: 'search', required: false, type: String, description: '全局搜索关键词' }),
    ApiQuery({ name: 'filter', required: false, style: 'deepObject', explode: true, type: 'object', description: '过滤条件, 格式: filter[field]=value' }),
    ApiQuery({ name: 'select', required: false, type: String, isArray: true, description: '指定返回字段' }),
    ApiQuery({ name: 'path', required: false, type: String }),
  )
}
