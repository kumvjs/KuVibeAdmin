import { validate } from 'class-validator'
import { MenuStatus, MenuType } from '../menu.types.js'
import { CreateMenuDto } from './create-menu.dto.js'
import { MenuNameExistsQueryDto, MenuPathExistsQueryDto } from './menu-exists-query.dto.js'
import { MenuIdParamDto } from './menu-id-param.dto.js'
import { UpdateMenuDto } from './update-menu.dto.js'

describe('vben menu DTO', () => {
  it.each(Object.values(MenuType))('accepts the Vben %s menu type', async (type) => {
    const dto = Object.assign(new CreateMenuDto(), {
      meta: { title: 'System menu', vendorExtension: true },
      name: 'SystemMenu',
      pid: '9007199254740993',
      status: MenuStatus.ENABLED,
      type,
    })

    await expect(validate(dto)).resolves.toEqual([])
  })

  it('rejects the removed numeric type and boolean status contracts', async () => {
    const dto = Object.assign(new CreateMenuDto(), {
      name: 'SystemMenu',
      status: true,
      type: 1,
    })

    const errors = await validate(dto)
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['status', 'type']))
  })

  it('accepts Vben menu existence queries with an optional positive bigint edit ID', async () => {
    const nameQuery = Object.assign(new MenuNameExistsQueryDto(), {
      id: '9007199254740993',
      name: 'SystemMenu',
    })
    const pathQuery = Object.assign(new MenuPathExistsQueryDto(), {
      path: '/system/menu',
    })

    await expect(validate(nameQuery)).resolves.toEqual([])
    await expect(validate(pathQuery)).resolves.toEqual([])
  })

  it('rejects missing lookup values and non-positive edit IDs', async () => {
    const nameQuery = Object.assign(new MenuNameExistsQueryDto(), { id: '0' })
    const pathQuery = Object.assign(new MenuPathExistsQueryDto(), { id: '-1' })

    const [nameErrors, pathErrors] = await Promise.all([
      validate(nameQuery),
      validate(pathQuery),
    ])
    expect(nameErrors.map(error => error.property)).toEqual(expect.arrayContaining(['id', 'name']))
    expect(pathErrors.map(error => error.property)).toEqual(expect.arrayContaining(['id', 'path']))
  })

  it('validates safe route, component, auth-code, link, and bigint fields', async () => {
    const dto = Object.assign(new CreateMenuDto(), {
      authCode: 'System:Menu:List',
      component: '/system/menu/list',
      linkSrc: 'https://docs.example.com/guide',
      meta: {
        authority: ['system:menu:list'],
        badgeType: 'normal',
        badgeVariants: 'primary',
        hideInMenu: false,
        order: 10,
        title: 'system.menu.title',
        vendorExtension: { enabled: true },
      },
      name: 'SystemMenu',
      path: '/system/menu',
      pid: '0',
      redirect: '/system/menu/list',
      status: MenuStatus.ENABLED,
      type: MenuType.MENU,
    })
    const params = Object.assign(new MenuIdParamDto(), { id: '9007199254740993' })

    await expect(validate(dto)).resolves.toEqual([])
    await expect(validate(params)).resolves.toEqual([])
  })

  it('rejects unsafe write fields and invalid known metadata types', async () => {
    const dto = Object.assign(new CreateMenuDto(), {
      authCode: 'not-segmented',
      component: 'https://evil.example/component',
      linkSrc: 'javascript:alert(1)',
      meta: {
        badgeVariants: 'unknown',
        hideInMenu: 'yes',
        title: 'System',
      },
      name: 'System Menu',
      path: '//evil.example',
      pid: '-1',
      redirect: '/system?tab=menu',
      status: MenuStatus.ENABLED,
      type: MenuType.MENU,
    })

    const errors = await validate(dto)
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining([
      'authCode',
      'component',
      'linkSrc',
      'meta',
      'name',
      'path',
      'pid',
      'redirect',
    ]))
  })

  it('keeps update payload fields optional while retaining their validators', async () => {
    const partial = Object.assign(new UpdateMenuDto(), { status: MenuStatus.DISABLED })
    const invalid = Object.assign(new UpdateMenuDto(), { path: 'relative/path' })

    await expect(validate(partial)).resolves.toEqual([])
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'path' }),
    ])
  })

  it('rejects non-positive or oversized menu path IDs', async () => {
    const zero = Object.assign(new MenuIdParamDto(), { id: '0' })
    const oversized = Object.assign(new MenuIdParamDto(), { id: '12345678901234567890' })

    await expect(validate(zero)).resolves.toEqual([expect.objectContaining({ property: 'id' })])
    await expect(validate(oversized)).resolves.toEqual([expect.objectContaining({ property: 'id' })])
  })
})
