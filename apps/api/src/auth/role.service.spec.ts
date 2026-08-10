import { COMPANY_PERMISSIONS, PERMISSION_GROUPS, Permission, SYSTEM_ROLE_PERMISSIONS } from '@medibridge/types'

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
})
