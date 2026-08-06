import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../common/prisma/prisma.service'
import { loadEnv } from '../config/env'

export interface AccessTokenPayload {
  sub: string
  role: string
  /** Short for "token version" — bumped on password change to kill old tokens. */
  tv: number
}

/**
 * Issues and rotates the two tokens.
 *
 * Access tokens are short-lived JWTs carried in an httpOnly cookie. Refresh
 * tokens are opaque random strings; only their SHA-256 is stored, so a database
 * leak does not hand out sessions.
 *
 * Rotation is single-use: refreshing revokes the old row and records which
 * token replaced it. If a revoked token is presented again, that is a replay —
 * the whole family is revoked and the user has to sign in again.
 */
@Injectable()
export class TokenService {
  private readonly env = loadEnv()

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      // Seconds, not the "15m" string: jsonwebtoken types that string as a
      // template literal from `ms`, and it reuses the same parser the cookie
      // maxAge uses, so the token and its cookie can never disagree.
      expiresIn: Math.floor(this.accessTtlMs() / 1000),
    })
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, { secret: this.env.JWT_ACCESS_SECRET })
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /** Creates a refresh token row and returns the raw value (shown once). */
  async issueRefreshToken(
    userId: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const raw = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + this.refreshTtlMs())

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        expiresAt,
        userAgent: context.userAgent?.slice(0, 400) ?? null,
        ipAddress: context.ipAddress?.slice(0, 45) ?? null,
      },
    })

    return raw
  }

  /**
   * Consumes a refresh token and returns a fresh one.
   * Returns null when the token is unknown, expired, or already used.
   */
  async rotateRefreshToken(
    raw: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<{ userId: string; refreshToken: string } | null> {
    const tokenHash = this.hash(raw)
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!existing) return null

    // Already revoked means either a replay or a stolen token. Either way,
    // drop every session this user has rather than guessing which is genuine.
    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId)
      return null
    }

    if (existing.expiresAt.getTime() < Date.now()) return null

    const nextRaw = randomBytes(48).toString('base64url')
    const nextHash = this.hash(nextRaw)

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenHash: nextHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: nextHash,
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
          userAgent: context.userAgent?.slice(0, 400) ?? null,
          ipAddress: context.ipAddress?.slice(0, 45) ?? null,
        },
      }),
    ])

    return { userId: existing.userId, refreshToken: nextRaw }
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Used by "sign out everywhere" and on suspected token theft. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  refreshTtlMs(): number {
    return parseDuration(this.env.JWT_REFRESH_TTL)
  }

  accessTtlMs(): number {
    return parseDuration(this.env.JWT_ACCESS_TTL)
  }
}

/** Parses "15m", "30d", "12h", "45s" into milliseconds. */
function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim())
  if (!match) throw new Error(`Invalid duration: ${value}`)
  const amount = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }
  return amount * (multipliers[unit as string] ?? 0)
}
