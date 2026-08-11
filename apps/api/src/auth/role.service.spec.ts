import {
  COMPANY_PERMISSIONS,
  PERMISSION_GROUPS,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  Permission,
  SYSTEM_ROLE_PERMISSIONS,
} from '@medibridge/types'

/**
 * The permission catalogue is what the roles screen renders and what the guard
 * checks against. If the two drift, a company either sees a tick-box that
 * grants nothing, or holds a permission it can never see or revoke — and
 * neither shows up until someone is wrongly allowed or wrongly refused.
 */
describe('permission catalogue', () => {
  it('gives every company permission a label', () => {
    const labelled = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)))
    const platformOnly = (key: string) => key.startsWith('platform.')

    const unlabelled = Object.values(Permission).filter(
      (key) => !platformOnly(key) && !labelled.has(key),
    )
    // An unlabelled key renders as a blank tick-box.
    expect(unlabelled).toEqual([])
  })

  it('never offers a platform-only permission to a company', () => {
    // These bypass tenancy. Offering one on a company screen would be offering
    // something that cannot work, at best.
    const offered = COMPANY_PERMISSIONS.filter((key) => key.startsWith('platform.'))
    expect(offered).toEqual([])
  })

  it('labels nothing that is not a real permission key', () => {
    const real = new Set<string>(Object.values(Permission))
    const invented = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)).filter(
      (key) => !real.has(key),
    )
    expect(invented).toEqual([])
  })

  it('keeps ROLE_MANAGE inside COMPANY_ADMIN', () => {
    // The one permission that can grant permissions back. Without it in the
    // seeded role, a fresh company is locked out of its own settings.
    expect(SYSTEM_ROLE_PERMISSIONS.COMPANY_ADMIN).toContain(Permission.ROLE_MANAGE)
  })

  it('gives every system role something to do', () => {
    for (const [role, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      expect(permissions.length).toBeGreaterThan(0)
      // A role holding a key no screen offers cannot be edited back.
      const strays = permissions.filter(
        (key) => !key.startsWith('platform.') && !COMPANY_PERMISSIONS.includes(key),
      )
      expect({ role, strays }).toEqual({ role, strays: [] })
    }
  })

  /**
   * The platform boundary.
   *
   * The global medicine catalogue is gated on `platform.catalogue`. What keeps
   * a distributor out of it is not the name of their role — it is that no
   * company role may carry a platform key at all, and the only role that does
   * is seeded on the platform tenant. Both halves are asserted here, because
   * either one alone leaves the catalogue editable by every company owner.
   */
  it('keeps platform keys out of every seeded company role', () => {
    for (const [role, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      const platform = permissions.filter((key) => key.startsWith('platform.'))
      expect({ role, platform }).toEqual({ role, platform: [] })
    }
  })

  it('excludes platform keys from what a company may be granted', () => {
    // RoleService checks incoming permissions against this list. A platform
    // key leaking into it would let a company admin grant themselves the
    // shared catalogue, which is one row edited for every tenant at once.
    for (const key of PLATFORM_PERMISSIONS) {
      expect(COMPANY_PERMISSIONS).not.toContain(key)
    }
    expect(PLATFORM_PERMISSIONS).toContain(Permission.PLATFORM_GLOBAL_CATALOGUE)
  })

  it('gives the platform role the catalogue key it is the only holder of', () => {
    expect(PLATFORM_ROLE_PERMISSIONS).toContain(Permission.PLATFORM_GLOBAL_CATALOGUE)
    // It supports tenants too, so it holds the company keys as well.
    for (const key of COMPANY_PERMISSIONS) {
      expect(PLATFORM_ROLE_PERMISSIONS).toContain(key)
    }
  })
})
