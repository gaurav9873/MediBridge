import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, AuthMethod, type SessionUser } from '@medibridge/types'
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface EmployeeSummary {
  id: string
  fullName: string
  phone: string
  email: string
  roleKey: string | null
  roleName: string | null
  accountStatus: string
  lastLoginAt: string | null
  /** The person asking. The UI must not offer to remove them. */
  isSelf: boolean
}

/**
 * The people who work for a company.
 *
 * A pharmacy has a counter assistant; a distributor has someone who packs
 * orders and someone who does the books. They need their own sign-in — sharing
 * the owner's password means the audit log records "the owner did it" for
 * everything, which is worse than useless when something goes wrong.
 *
 * An employee is an ordinary User with the company's id and a role from that
 * company's own role table. There is no second concept: the same guard, the
 * same permissions, the same Row-Level Security.
 *
 * They are created rather than emailed an invitation link, because the owner is
 * usually standing next to them. The temporary password is shown once, and the
 * employee is expected to change it — which the account screen already does.
 */
@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name)

  constructor(private readonly db: TenantPrismaService) {}

  async list(user: SessionUser): Promise<EmployeeSummary[]> {
    const companyId = requireCompany(user)

    // Scoped by RLS as well as by the where clause: run() applies the tenant,
    // so a bug in the filter cannot reach another company's staff.
    const employees = await this.db.run((tx) =>
      tx.user.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { roleAssignments: { include: { role: true } } },
      }),
    )

    return employees.map((employee) => {
      const role = employee.roleAssignments[0]?.role
      return {
        id: employee.id,
        fullName: employee.fullName,
        phone: employee.phone,
        email: employee.email,
        roleKey: role?.key ?? null,
        roleName: role?.name ?? null,
        accountStatus: employee.accountStatus,
        lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
        isSelf: employee.id === user.id,
      }
    })
  }

  /**
   * Adds a colleague to this company.
   *
   * The company comes from the session, never from the request — otherwise
   * anyone could add staff to somebody else's tenant. The role must be one of
   * that company's own roles for the same reason.
   */
  async invite(
    user: SessionUser,
    input: { fullName: string; phone: string; email: string; roleKey: string },
  ): Promise<{ employee: EmployeeSummary; temporaryPassword: string }> {
    const companyId = requireCompany(user)

    const role = await this.db.run((tx) =>
      tx.role.findFirst({ where: { companyId, key: input.roleKey }, select: { id: true } }),
    )
    if (!role) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'roleKey', message: 'Please choose a role from the list.' }],
      })
    }

    await this.assertIdentifiersFree(input.phone, input.email)

    // Readable over the counter, and long enough that it is not worth guessing
    // in the minutes before it gets changed.
    const temporaryPassword = `Mb-${randomBytes(6).toString('base64url')}`
    const passwordHash = await argon2.hash(temporaryPassword)

    const created = await this.db.runPreTenant(async (tx) => {
      const employee = await tx.user.create({
        data: {
          companyId,
          phone: input.phone,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          // Staff inherit the side of the market their company is on.
          role: user.role,
          // Not PENDING_VERIFICATION: the licence being checked is the
          // company's, and it was checked when the company was approved.
          accountStatus: 'ACTIVE',
        },
      })

      await tx.userIdentity.create({
        data: {
          userId: employee.id,
          method: AuthMethod.PASSWORD,
          identifier: input.phone,
          secretHash: passwordHash,
          isVerified: false,
        },
      })

      await tx.userRoleAssignment.create({ data: { userId: employee.id, roleId: role.id } })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'ADD_EMPLOYEE',
          entityType: 'User',
          entityId: employee.id,
          after: { fullName: input.fullName, phone: input.phone, roleKey: input.roleKey },
        },
      })

      return employee
    })

    this.logger.log(`Employee added to ${companyId}`)

    const employees = await this.list(user)
    const summary = employees.find((candidate) => candidate.id === created.id)!
    return { employee: summary, temporaryPassword }
  }

  /**
   * Removes a colleague.
   *
   * A soft delete: their name stays on the orders they packed and the audit
   * entries they caused. Sessions are revoked so removal takes effect now
   * rather than whenever their access token happens to expire.
   */
  async remove(user: SessionUser, employeeId: string): Promise<void> {
    const companyId = requireCompany(user)

    if (employeeId === user.id) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'employeeId', message: 'You cannot remove your own account.' }],
      })
    }

    const employee = await this.db.run((tx) =>
      tx.user.findFirst({ where: { id: employeeId, companyId, deletedAt: null } }),
    )
    if (!employee) throw new AppException(ApiErrorCode.NOT_FOUND)

    await this.db.runPreTenant(async (tx) => {
      await tx.user.update({ where: { id: employeeId }, data: { deletedAt: new Date() } })
      await tx.refreshToken.updateMany({
        where: { userId: employeeId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'REMOVE_EMPLOYEE',
          entityType: 'User',
          entityId: employeeId,
          before: { fullName: employee.fullName, phone: employee.phone },
        },
      })
    })
  }

  private async assertIdentifiersFree(phone: string, email: string): Promise<void> {
    const existing = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({
        where: { OR: [{ phone }, { email }], deletedAt: null },
        select: { phone: true },
      }),
    )
    if (!existing) return
    throw new AppException(
      existing.phone === phone
        ? ApiErrorCode.PHONE_ALREADY_REGISTERED
        : ApiErrorCode.EMAIL_ALREADY_REGISTERED,
    )
  }
}

/** Staff belong to a company. The platform owner has no staff of this kind. */
function requireCompany(user: SessionUser): string {
  if (!user.companyId) throw new AppException(ApiErrorCode.FORBIDDEN)
  return user.companyId
}
