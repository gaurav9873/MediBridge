import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiErrorCode, Permission } from '@medibridge/types'
import { PermissionGuard, PERMISSIONS_KEY } from './permission.guard'

/**
 * Whether a request is allowed through.
 *
 * The two cases that matter are the two that are easy to get backwards: a
 * missing permission must refuse, and a route that asks for nothing must not
 * start refusing everyone. Both are silent failures — one lets people do
 * things they should not, the other locks out a working product.
 */
function contextFor(userId: string | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => (userId ? { user: { id: userId } } : {}) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

function guardWith(required: Permission[] | undefined, granted: string[]) {
  const reflector = {
    getAllAndOverride: (key: string) => (key === PERMISSIONS_KEY ? required : undefined),
  } as unknown as Reflector
  const cache = { permissionsFor: async () => new Set(granted) }
  return new PermissionGuard(reflector, cache as never)
}

describe('PermissionGuard', () => {
  it('allows a route that requires nothing', async () => {
    // Most routes are guarded by role or by ownership, not by a permission
    // key. If this refused, the whole product would stop.
    const guard = guardWith(undefined, [])
    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true)
  })

  it('allows a user who holds the required permission', async () => {
    const guard = guardWith([Permission.SETTINGS_MANAGE], [Permission.SETTINGS_MANAGE])
    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true)
  })

  it('refuses a user who does not', async () => {
    const guard = guardWith([Permission.SETTINGS_MANAGE], [Permission.ORDER_VIEW])
    await expect(guard.canActivate(contextFor('user-1'))).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    })
  })

  it('requires EVERY permission a route asks for, not just one', async () => {
    // A route asking for two and accepting one is the kind of thing that only
    // shows up when someone with half the access does something they should not.
    const guard = guardWith(
      [Permission.EMPLOYEE_VIEW, Permission.EMPLOYEE_MANAGE],
      [Permission.EMPLOYEE_VIEW],
    )
    await expect(guard.canActivate(contextFor('user-1'))).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    })
  })

  it('refuses when there is no session at all', async () => {
    const guard = guardWith([Permission.SETTINGS_MANAGE], [Permission.SETTINGS_MANAGE])
    await expect(guard.canActivate(contextFor(null))).rejects.toMatchObject({
      code: ApiErrorCode.UNAUTHENTICATED,
    })
  })
})
