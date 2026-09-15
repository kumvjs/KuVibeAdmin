import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PlaygroundStatusQueryDto, PlaygroundTableQueryDto } from './playground.dto.js'

describe('playground DTO validation', () => {
  it('normalizes safe table pagination and sorting', async () => {
    const dto = plainToInstance(PlaygroundTableQueryDto, {
      page: '2',
      pageSize: '25',
      sortBy: 'quantity',
      sortOrder: 'desc',
    })

    await expect(validate(dto)).resolves.toHaveLength(0)
    expect(dto).toMatchObject({ page: 2, pageSize: 25, sortBy: 'quantity', sortOrder: 'desc' })
  })

  it('rejects unbounded pagination and arbitrary sort properties', async () => {
    const dto = plainToInstance(PlaygroundTableQueryDto, {
      page: '0',
      pageSize: '101',
      sortBy: '__proto__',
      sortOrder: 'sideways',
    })

    const properties = (await validate(dto)).map(error => error.property)
    expect(properties).toEqual(expect.arrayContaining(['page', 'pageSize', 'sortBy', 'sortOrder']))
  })

  it('defaults the status demo to 200 and bounds explicit status codes', async () => {
    const defaultDto = plainToInstance(PlaygroundStatusQueryDto, {})
    const invalidDto = plainToInstance(PlaygroundStatusQueryDto, { status: '600' })

    await expect(validate(defaultDto)).resolves.toHaveLength(0)
    expect(defaultDto.status).toBe(200)
    await expect(validate(invalidDto)).resolves.not.toHaveLength(0)
  })
})
