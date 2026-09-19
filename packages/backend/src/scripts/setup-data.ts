import type { DataSource, EntityManager } from 'typeorm'
import { In, IsNull } from 'typeorm'
import { Roles } from '../modules/auth/auth.constant.js'
import { DEPT_PERMISSIONS, DeptStatus } from '../modules/system/dept/dept.types.js'
import { SysDeptEntity } from '../modules/system/dept/entities/dept.entity.js'
import { SysMenuEntity } from '../modules/system/menu/entities/menu.entity.js'
import { MENU_PERMISSIONS, MenuStatus, MenuType } from '../modules/system/menu/menu.types.js'
import SysRoleMenuEntity from '../modules/system/role/entities/role-menu.entity.js'
import { SysRoleEntity } from '../modules/system/role/entities/role.entity.js'
import { ROLE_PERMISSIONS, RoleStatus } from '../modules/system/role/role.types.js'
import { SYS_USER_PERMISSIONS } from '../modules/system/sys-user/sys-user.types.js'
import { UPLOAD_POLICY_PERMISSIONS } from '../modules/upload/upload.constants.js'
import SysUserRoleEntity from '../modules/user/entities/user-role.entity.js'

interface SeedMenu {
  name: string
  parent?: string
  path?: string
  component?: string
  authCode?: string
  type: MenuType
  meta: { title: string, icon?: string, order?: number }
}

// 页面对应锁定的 Vben v5.7.0；权限码始终使用本项目控制器的定义。
const systemPages = [
  { key: 'dept', name: 'SystemDept', title: '部门管理', icon: 'charm:organisation', permissions: DEPT_PERMISSIONS },
  { key: 'menu', name: 'SystemMenu', title: '菜单管理', icon: 'mdi:menu', permissions: MENU_PERMISSIONS },
  { key: 'role', name: 'SystemRole', title: '角色管理', icon: 'mdi:account-group', permissions: ROLE_PERMISSIONS },
  { key: 'user', name: 'SystemUser', title: '用户管理', icon: 'mdi:user', permissions: SYS_USER_PERMISSIONS },
]

export const INITIAL_MENUS: SeedMenu[] = [
  { name: 'System', path: '/system', type: MenuType.CATALOG, meta: { title: '系统管理', icon: 'ion:settings-outline', order: 9997 } },
  ...systemPages.flatMap((page, order): SeedMenu[] => [
    { name: page.name, parent: 'System', path: `/system/${page.key}`, component: `/system/${page.key}/list`, authCode: page.permissions.LIST, type: MenuType.MENU, meta: { title: page.title, icon: page.icon, order } },
    ...([
      ['Create', '新增', page.permissions.CREATE],
      ['Edit', '编辑', page.permissions.UPDATE],
      ['Delete', '删除', page.permissions.DELETE],
    ] as const).map(([suffix, title, authCode]): SeedMenu => ({ name: `${page.name}${suffix}`, parent: page.name, authCode, type: MenuType.BUTTON, meta: { title } })),
  ]),
  { name: 'SystemAttachment', parent: 'System', path: '/system/attachment', type: MenuType.CATALOG, meta: { title: '附件管理', icon: 'lucide:paperclip', order: 4 } },
  ...([
    ['AttachmentList', '附件列表', 'system:attachment:list'],
    ['AttachmentRead', '附件详情与下载', 'system:attachment:read'],
    ['AttachmentDelete', '删除附件', 'system:attachment:delete'],
    ['UploadPolicyRead', '查看上传策略', UPLOAD_POLICY_PERMISSIONS.READ],
    ['UploadPolicyWrite', '配置上传策略', UPLOAD_POLICY_PERMISSIONS.WRITE],
  ] as const).map(([name, title, authCode]): SeedMenu => ({ name, parent: 'SystemAttachment', authCode, type: MenuType.BUTTON, meta: { title } })),
]

async function seedMenus(manager: EntityManager): Promise<void> {
  const repository = manager.getRepository(SysMenuEntity)
  const ids = new Map<string, string>()
  for (const seed of INITIAL_MENUS) {
    const { parent, ...fields } = seed
    const pid = parent ? ids.get(parent)! : null
    const matches = await repository.find({
      where: [
        { name: seed.name },
        ...(seed.path ? [{ path: seed.path }] : []),
        ...(seed.authCode ? [{ authCode: seed.authCode }] : []),
      ],
      withDeleted: true,
    })
    const current = matches[0]
    // 兼容旧种子：五项附件权限曾直接挂在 System 下，只调整父级以保留授权关联。
    const moveLegacyAttachment = current && seed.parent === 'SystemAttachment'
      && seed.type === MenuType.BUTTON && current.pid === ids.get('System')
    if (matches.length > 1 || (current && (
      current.deletedAt || current.status !== MenuStatus.ENABLED
      || current.name !== seed.name || (current.path ?? null) !== (seed.path ?? null)
      || (current.authCode ?? null) !== (seed.authCode ?? null)
      || current.type !== seed.type || ((current.pid ?? null) !== pid && !moveLegacyAttachment)
      || (current.component ?? null) !== (seed.component ?? null)
    ))) {
      throw new Error(`初始化菜单冲突：${seed.name}；请核对已有记录，脚本不会覆盖或恢复它。`)
    }
    if (moveLegacyAttachment)
      await repository.update(current.id, { pid })
    const menu = current ?? await repository.save(repository.create({
      ...fields,
      pid,
      path: seed.path ?? null,
      component: seed.component ?? null,
      authCode: seed.authCode ?? null,
      redirect: null,
      status: MenuStatus.ENABLED,
    }))
    ids.set(seed.name, String(menu.id))
  }
}

export async function initializeBaseData(source: DataSource): Promise<{ rootDeptId: string, affectedUserIds: string[] }> {
  return source.transaction('SERIALIZABLE', async (manager) => {
    const roles = manager.getRepository(SysRoleEntity)
    let userRole = await roles.findOne({ where: { code: Roles.USER }, withDeleted: true })
    if (userRole && (userRole.deletedAt || userRole.status !== RoleStatus.ENABLED))
      throw new Error('user 角色已停用或删除，请先核对并恢复。')
    const defaults = await roles.find({ where: { isDefault: true } })
    if (defaults.some(role => role.code !== Roles.USER))
      throw new Error('已有其他默认角色，请先明确默认角色归属；初始化不会覆盖。')
    if (!userRole) {
      userRole = await roles.save(roles.create({ name: '普通用户', code: Roles.USER, status: RoleStatus.ENABLED, isDefault: true, remark: '默认普通用户，无系统管理权限' }))
    }
    else if (!userRole.isDefault) {
      userRole.isDefault = true
      await roles.save(userRole)
    }

    const depts = manager.getRepository(SysDeptEntity)
    let root = await depts.findOne({ where: { pid: IsNull(), status: DeptStatus.ENABLED }, order: { id: 'ASC' } })
    if (!root) {
      const conflict = await depts.findOne({ where: { pid: IsNull(), name: '根部门' }, withDeleted: true })
      if (conflict)
        throw new Error('根部门已停用或删除，请先核对并恢复。')
      root = await depts.save(depts.create({ name: '根部门', pid: null, status: DeptStatus.ENABLED, order: 0, remark: '初始化根部门' }))
    }

    await seedMenus(manager)

    // 只移除普通用户角色上的管理授权；保留人工配置的业务权限及其他角色。
    const managementMenus = await manager.getRepository(SysMenuEntity).find({ withDeleted: true })
    const managementIds = managementMenus
      .filter(menu => menu.authCode?.toLowerCase().startsWith('system:') || menu.path === '/system' || menu.path?.startsWith('/system/'))
      .map(menu => menu.id)
    if (managementIds.length)
      await manager.getRepository(SysRoleMenuEntity).delete({ roleId: userRole.id, menuId: In(managementIds) })

    // 每次返回完整受影响用户，即使前次数据库提交后缓存清理失败，重跑也能恢复。
    const affectedRoles = await roles.find({ where: { code: In([Roles.SUPER, Roles.USER]) } })
    const links = await manager.getRepository(SysUserRoleEntity).find({ where: { roleId: In(affectedRoles.map(role => role.id)) } })
    return { rootDeptId: String(root.id), affectedUserIds: [...new Set(links.map(link => String(link.userId)))] }
  })
}
