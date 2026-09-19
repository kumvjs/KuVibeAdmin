import { UnprocessableEntityException } from '@nestjs/common'
import { buildMenuWriteState } from './menu-write.rules.js'
import { MenuStatus, MenuType } from './menu.types.js'

function payload(type: MenuType, extra: Record<string, unknown> = {}) {
  return {
    meta: { title: `${type}.title` },
    name: `${type}Node`,
    status: MenuStatus.ENABLED,
    type,
    ...extra,
  } as any
}

describe('menu write type rules', () => {
  it.each([
    [MenuType.CATALOG, { path: '/catalog' }],
    [MenuType.MENU, { component: '/system/menu/list', path: '/menu' }],
    [MenuType.EMBEDDED, { linkSrc: 'https://docs.example.com', path: '/docs' }],
    [MenuType.LINK, { linkSrc: 'https://example.com' }],
    [MenuType.BUTTON, { authCode: 'system:menu:create', pid: '1' }],
  ] as const)('accepts and normalizes the %s contract', (type, fields) => {
    const state = buildMenuWriteState(payload(type, fields))

    expect(state.type).toBe(type)
    expect(state.meta.title).toBe(`${type}.title`)
    if (type === MenuType.EMBEDDED)
      expect(state.meta.iframeSrc).toBe('https://docs.example.com')
    if (type === MenuType.LINK)
      expect(state.meta.link).toBe('https://example.com')
    if (type === MenuType.BUTTON)
      expect(state).toMatchObject({ component: null, path: null, redirect: null })
  })

  it.each([
    [MenuType.CATALOG, {}, 'path'],
    [MenuType.MENU, { path: '/menu' }, 'component'],
    [MenuType.EMBEDDED, { path: '/docs' }, 'meta.iframeSrc'],
    [MenuType.LINK, {}, 'meta.link'],
    [MenuType.BUTTON, { pid: '1' }, 'authCode'],
    [MenuType.BUTTON, { authCode: 'system:menu:create' }, '父级'],
  ] as const)('rejects incomplete %s fields', (type, fields, expectedMessage) => {
    expect(() => buildMenuWriteState(payload(type, fields))).toThrow(expectedMessage)
  })

  it('maps compatibility fields into metadata and removes stale type-specific values', () => {
    const current = {
      authCode: 'system:menu:list',
      component: '/system/menu/list',
      meta: {
        activePath: '/system/menu',
        iframeSrc: 'https://old.example.com',
        title: 'Old title',
      },
      name: 'SystemMenu',
      path: '/system/menu',
      pid: '1',
      redirect: '/system/menu/list',
      status: MenuStatus.ENABLED,
      type: MenuType.EMBEDDED,
    } as any

    const state = buildMenuWriteState(payload(MenuType.LINK, {
      linkSrc: 'https://new.example.com',
      meta: { title: 'New title' },
      name: 'ExternalLink',
    }), current)

    expect(state).toMatchObject({ authCode: null, redirect: null, type: MenuType.LINK })
    expect(state.meta).toMatchObject({ link: 'https://new.example.com', title: 'New title' })
    expect(state.meta).not.toHaveProperty('activePath')
    expect(state.meta).not.toHaveProperty('iframeSrc')
  })

  it.each([
    [{ component: '../secrets', path: '/menu' }, 'component'],
    [{ component: 'https://evil.example/view', path: '/menu' }, 'component'],
    [{ component: '/system/menu/list', path: '/menu?debug=1' }, 'path'],
  ])('rejects unsafe component and route values', (fields, expectedMessage) => {
    expect(() => buildMenuWriteState(payload(MenuType.MENU, fields))).toThrow(expectedMessage)
  })

  it.each([
    'javascript:alert(1)',
    'https://user:password@example.com',
    'not-a-url',
  ])('rejects unsafe external target %s', (linkSrc) => {
    expect(() => buildMenuWriteState(payload(MenuType.LINK, { linkSrc })))
      .toThrow(UnprocessableEntityException)
  })

  it('normalizes pid zero to a root and rejects values outside PostgreSQL bigint', () => {
    expect(buildMenuWriteState(payload(MenuType.CATALOG, { path: '/root', pid: '0' })).pid).toBeNull()
    expect(() => buildMenuWriteState(payload(MenuType.CATALOG, {
      path: '/root',
      pid: '9223372036854775808',
    }))).toThrow('PostgreSQL bigint')
  })
})
