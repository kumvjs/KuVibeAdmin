import { applyDecorators, Type } from '@nestjs/common'
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger'
import { ApiResultOptions, ResOp, ResultDataAndTotalDto } from '../dto/response.dto.js'

const baseTypeNames = ['String', 'Number', 'Boolean']
/**
 * @description: 生成统一返回结果的 Swagger 装饰器
 */
export function ApiResult<TModel extends Type<any>>(options: ApiResultOptions<TModel> = {}) {
  const { type, isPage = false, description, status = 200, nullable = false } = options

  const extraModels: Type<any>[] = [ResOp]
  let dataSchema: any = {}

  // 1. 处理分页列表 [ResOp -> data -> { data, total }]
  if (isPage) {
    const targetType = Array.isArray(type) ? type[0] : type
    if (targetType)
      extraModels.push(ResultDataAndTotalDto, targetType)

    dataSchema = {
      type: 'object',
      required: ['data', 'total'],
      properties: {
        data: {
          type: 'array',
          items: genPropSchema(targetType),
        },
        total: { type: 'number' },
      },
    }
  }
  // 2. 处理普通纯数组 [ResOp -> data -> TModel[] ]
  else if (Array.isArray(type)) {
    const targetType = Array.isArray(type) ? type[0] : type
    if (targetType && !baseTypeNames.includes(targetType.name)) {
      extraModels.push(targetType)
    }
    dataSchema = {
      type: 'array',
      items: genPropSchema(targetType),
    }
  }
  // 3. 处理非列表（单条对象、基础类型、纯 JSON）[ResOp -> data -> TModel]
  else {
    if (type && !baseTypeNames.includes((type as any).name)) {
      extraModels.push(type as Type<any>)
    }
    dataSchema = genPropSchema(type)
  }

  // 4. 返回组合后的 Swagger 装饰器
  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResOp) }, // 继承基础结构 code, message, success
          {
            properties: {
              data: nullable ? { ...dataSchema, nullable: true } : dataSchema, // 动态覆盖 data 字段的类型
            },
          },
        ],
      },
    }),
  )
}

/**
 * 根据传入的类型生成对应的 OpenAPI Schema 属性
 */
function genPropSchema(type: any) {
  if (!type) {
    // 未传类型，当做未知 JSON/Object 处理
    return { type: 'object', additionalProperties: true }
  }
  if (baseTypeNames.includes(type.name)) {
    // 基础类型处理 String -> string
    return { type: type.name.toLowerCase() }
  }
  // 复杂的 DTO 或 Entity 引用
  return { $ref: getSchemaPath(type) }
}
