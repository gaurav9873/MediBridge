import { Injectable, Logger } from '@nestjs/common'
import {
  type AddressInput,
  ApiErrorCode,
  ChallengePurpose,
  NOTIFIABLE_EVENTS,
  type SessionUser,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { ChallengeService } from '../auth/challenge.service'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface ProfileSummary {
  id: string
  fullName: string
  phone: string
  email: string
  role: string
  accountStatus: string
  businessName: string | null
  roleName: string | null
  phoneVerified: boolean
  emailVerified: boolean
  lastLoginAt: string | null
  memberSince: string
}

export interface AddressSummary {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  contactPhone: string
  latitude: number
  longitude: number
  isDefault: boolean
}

export interface NotificationSetting {
  event: string
  label: string
  description: string
  channels: Record<string, boolean>
}

/** The channels a person can choose between. IN_APP is always on. */
const CHOOSABLE_CHANNELS = ['SMS', 'EMAIL', 'WHATSAPP'] as const

/**
 * A person looking after their own account.
 *
 * Everything here is scoped to the caller. There is no userId parameter on any
 * public method — someone editing their own name should not be one crafted
 * request away from editing a colleague's.
 *
 * The company's details are Phase 2.3's job; this is only the person.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly challenges: ChallengeService,
  ) {}

  async get(user: SessionUser): Promise<ProfileSummary> {
    const record = await this.db.runPreTenant((tx) =>
      tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          role: true,
          accountStatus: true,
          phoneVerifiedAt: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          customerProfile: { select: { businessName: true } },
          companyRef: { select: { name: true } },
          roleAssignments: { select: { role: { select: { name: true } } }, take: 1 },
        },
      }),
    )
    if (!record) throw new AppException(ApiErrorCode.NOT_FOUND)

    return {
      id: record.id,
      fullName: record.fullName,
      phone: record.phone,
      email: record.email,
      role: record.role,
      accountStatus: record.accountStatus,
      businessName: record.customerProfile?.businessName ?? record.companyRef?.name ?? null,
      roleName: record.roleAssignments[0]?.role.name ?? null,
      phoneVerified: record.phoneVerifiedAt != null,
      emailVerified: record.emailVerifiedAt != null,
      lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
      memberSince: record.createdAt.toISOString(),
    }
  }

  /**
   * Name and email.
   *
   * The mobile number is deliberately not here: it is the sign-in identifier,
   * so changing it needs a code sent to the new number. See requestPhoneChange.
   */
  async update(user: SessionUser, input: { fullName: string; email: string }): Promise<ProfileSummary> {
    const clash = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({
        where: { email: input.email, id: { not: user.id }, deletedAt: null },
        select: { id: true },
      }),
    )
    if (clash) throw new AppException(ApiErrorCode.EMAIL_ALREADY_REGISTERED)

    await this.db.runPreTenant(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: user.id },
        select: { fullName: true, email: true, emailVerifiedAt: true },
      })

      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: input.fullName,
          email: input.email,
          // A new address has not been confirmed, whatever the old one was.
          emailVerifiedAt: before?.email === input.email ? before.emailVerifiedAt : null,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'UPDATE_PROFILE',
          entityType: 'User',
          entityId: user.id,
          before: { fullName: before?.fullName, email: before?.email } as never,
          after: { fullName: input.fullName, email: input.email } as never,
        },
      })
    })

    return this.get(user)
  }

  /**
   * Starts a mobile number change.
   *
   * The code goes to the NEW number, because the point is to prove they hold
   * it. Sending it to the old one would only prove they still have the phone
   * they are trying to stop using.
   */
  async requestPhoneChange(user: SessionUser, newPhone: string, ipAddress?: string) {
    if (newPhone === user.phone) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'phone', message: 'That is already your mobile number.' }],
      })
    }

    const taken = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({ where: { phone: newPhone, deletedAt: null }, select: { id: true } }),
    )
    if (taken) throw new AppException(ApiErrorCode.PHONE_ALREADY_REGISTERED)

    return this.challenges.issue({
      purpose: ChallengePurpose.VERIFY_PHONE,
      identifier: newPhone,
      userId: user.id,
      ipAddress,
    })
  }

  /**
   * Completes the change once the code is confirmed.
   *
   * The password identity moves with it: the identifier IS the mobile number,
   * so leaving it behind would let the old number keep signing in.
   */
  async confirmPhoneChange(user: SessionUser, newPhone: string, code: string): Promise<ProfileSummary> {
    await this.challenges.verify({
      purpose: ChallengePurpose.VERIFY_PHONE,
      identifier: newPhone,
      code,
    })

    await this.db.runPreTenant(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: user.id }, select: { phone: true } })

      await tx.user.update({
        where: { id: user.id },
        data: { phone: newPhone, phoneVerifiedAt: new Date() },
      })
      await tx.userIdentity.updateMany({
        where: { userId: user.id, identifier: before?.phone },
        data: { identifier: newPhone },
      })

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'CHANGE_PHONE',
          entityType: 'User',
          entityId: user.id,
          before: { phone: before?.phone } as never,
          after: { phone: newPhone } as never,
        },
      })
    })

    this.logger.log(`Mobile number changed for ${user.id}`)
    return this.get(user)
  }

  // ---------------------------------------------------------------------------
  // Addresses
  // ---------------------------------------------------------------------------

  async listAddresses(user: SessionUser): Promise<AddressSummary[]> {
    const addresses = await this.db.run((tx) =>
      tx.address.findMany({
        where: { userId: user.id, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    )
    return addresses.map(toAddress)
  }

  /**
   * Adds a delivery address.
   *
   * The coordinates are what every Same-Day radius check measures from, so a
   * retailer with the wrong pin sees the wrong delivery options rather than an
   * error — which is why the screen explains them rather than hiding them.
   */
  async addAddress(user: SessionUser, input: AddressInput): Promise<AddressSummary[]> {
    await this.db.run(async (tx) => {
      const existing = await tx.address.count({ where: { userId: user.id, deletedAt: null } })

      await tx.address.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          label: input.label,
          line1: input.line1,
          line2: input.line2,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          contactPhone: input.contactPhone,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          // The first one is the default, so someone with exactly one address
          // never meets the concept.
          isDefault: existing === 0,
        },
      })
    })
    return this.listAddresses(user)
  }

  async setDefaultAddress(user: SessionUser, addressId: string): Promise<AddressSummary[]> {
    await this.db.run(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: addressId, userId: user.id, deletedAt: null },
      })
      if (!address) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
      await tx.address.update({ where: { id: addressId }, data: { isDefault: true } })
    })
    return this.listAddresses(user)
  }

  /**
   * Removes an address.
   *
   * Soft, because orders reference the address they were delivered to and an
   * invoice must still show where the medicines went. The last one cannot be
   * removed: search needs somewhere to measure from.
   */
  async removeAddress(user: SessionUser, addressId: string): Promise<AddressSummary[]> {
    await this.db.run(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: addressId, userId: user.id, deletedAt: null },
      })
      if (!address) throw new AppException(ApiErrorCode.NOT_FOUND)

      const remaining = await tx.address.count({
        where: { userId: user.id, deletedAt: null, id: { not: addressId } },
      })
      if (remaining === 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'addressId',
              message:
                'This is your only address. Add another one first — we need somewhere to measure delivery distance from.',
            },
          ],
        })
      }

      await tx.address.update({ where: { id: addressId }, data: { deletedAt: new Date() } })

      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: user.id, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    })
    return this.listAddresses(user)
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  /**
   * What we would tell them about, and how.
   *
   * Absent rows mean "on": a new event should reach people by default rather
   * than silently not reaching them until they find this screen. So the stored
   * rows are only the opt-OUTs, and the list is built from the catalogue.
   */
  async notificationSettings(user: SessionUser): Promise<NotificationSetting[]> {
    const stored = await this.db.run((tx) =>
      tx.notificationPreference.findMany({
        where: { userId: user.id },
        select: { event: true, channel: true, enabled: true },
      }),
    )

    const disabled = new Set(
      stored.filter((row) => !row.enabled).map((row) => `${row.event}:${row.channel}`),
    )

    return NOTIFIABLE_EVENTS.map((event) => ({
      event: event.key,
      label: event.label,
      description: event.description,
      channels: Object.fromEntries(
        CHOOSABLE_CHANNELS.map((channel) => [channel, !disabled.has(`${event.key}:${channel}`)]),
      ),
    }))
  }

  async setNotification(
    user: SessionUser,
    input: { event: string; channel: string; enabled: boolean },
  ): Promise<NotificationSetting[]> {
    await this.db.run((tx) =>
      tx.notificationPreference.upsert({
        where: {
          userId_event_channel: {
            userId: user.id,
            event: input.event as never,
            channel: input.channel as never,
          },
        },
        create: {
          companyId: user.companyId,
          userId: user.id,
          event: input.event as never,
          channel: input.channel as never,
          enabled: input.enabled,
        },
        update: { enabled: input.enabled },
      }),
    )
    return this.notificationSettings(user)
  }
}

function toAddress(address: {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  contactPhone: string
  latitude: number
  longitude: number
  isDefault: boolean
}): AddressSummary {
  return {
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    contactPhone: address.contactPhone,
    latitude: address.latitude,
    longitude: address.longitude,
    isDefault: address.isDefault,
  }
}
