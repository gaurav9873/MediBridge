import { createHash } from 'node:crypto'
import { ApiErrorCode, CHALLENGE_MAX_ATTEMPTS, ChallengePurpose } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { ChallengeService } from './challenge.service'

/**
 * The rules that make a one-time code worth anything.
 *
 * Every one of these has a cost if it breaks: a code that never expires, one
 * that survives unlimited guessing, one that works twice, or one issued to
 * reset a password that can be spent to sign in. None of that is visible in a
 * happy-path click-through, which is exactly why it is tested here.
 *
 * The database is a fake rather than a mock library: these tests are about the
 * decisions the service makes, and a hand-written store makes the state those
 * decisions read from obvious.
 */

interface Row {
  id: string
  purpose: string
  identifier: string
  codeHash: string
  expiresAt: Date
  attempts: number
  consumedAt: Date | null
  userId: string | null
  createdAt: Date
}

/** Just enough of TenantPrismaService and the challenge table to run the rules. */
function fakeDb() {
  const rows: Row[] = []
  let nextId = 1

  const table = {
    async findFirst({ where, orderBy }: any) {
      let found = rows.filter(
        (row) =>
          row.purpose === where.purpose &&
          row.identifier === where.identifier &&
          (where.consumedAt === null ? row.consumedAt === null : true) &&
          (where.createdAt?.gt ? row.createdAt > where.createdAt.gt : true),
      )
      if (orderBy?.createdAt === 'desc') found = [...found].reverse()
      return found[0] ?? null
    },
    async create({ data }: any) {
      const row: Row = {
        id: String(nextId++),
        attempts: 0,
        consumedAt: null,
        userId: null,
        createdAt: new Date(),
        ...data,
      }
      rows.push(row)
      return row
    },
    async update({ where, data }: any) {
      const row = rows.find((candidate) => candidate.id === where.id)!
      Object.assign(row, data)
      return row
    },
    async updateMany({ where, data }: any) {
      const matched = rows.filter(
        (row) =>
          row.purpose === where.purpose &&
          row.identifier === where.identifier &&
          row.consumedAt === null,
      )
      for (const row of matched) Object.assign(row, data)
      return { count: matched.length }
    },
  }

  const db = {
    runPreTenant: <T,>(fn: (tx: any) => Promise<T>) => fn({ verificationChallenge: table }),
  }

  return { db, rows }
}

function makeService() {
  const { db, rows } = fakeDb()
  const sent: Array<{ identifier: string; code: string; purpose: string }> = []
  const sender = {
    channel: 'CONSOLE' as const,
    async send(identifier: string, code: string, purpose: any) {
      sent.push({ identifier, code, purpose })
    },
  }
  const service = new ChallengeService(db as never, sender)
  return { service, rows, sent }
}

const PHONE = '9000000020'

/** Reads the code out of what the fake sender received. */
function lastCode(sent: Array<{ code: string }>): string {
  return sent[sent.length - 1]!.code
}

async function codeFor(service: ChallengeService, sent: Array<{ code: string }>, purpose = ChallengePurpose.SIGN_IN) {
  await service.issue({ purpose, identifier: PHONE })
  return lastCode(sent)
}

/** Moves every challenge's creation time back so the resend window has passed. */
function ageOutResendWindow(rows: Row[]): void {
  for (const row of rows) row.createdAt = new Date(row.createdAt.getTime() - 120_000)
}

describe('ChallengeService', () => {
  it('issues a six-digit code and never stores it in the clear', async () => {
    const { service, rows, sent } = makeService()

    const issued = await service.issue({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE })
    const code = lastCode(sent)

    expect(code).toMatch(/^\d{6}$/)
    expect(issued.sentTo).toBe('••••••0020')
    // The row holds the hash, not the code.
    expect(rows[0]!.codeHash).toBe(createHash('sha256').update(code).digest('hex'))
    expect(JSON.stringify(rows)).not.toContain(code)
  })

  it('accepts the correct code exactly once', async () => {
    const { service, rows, sent } = makeService()
    const code = await codeFor(service, sent)

    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code }),
    ).resolves.toEqual({ userId: null })

    // Replaying it must fail: a code read over someone's shoulder is worthless
    // once it has been spent.
    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code }),
    ).rejects.toThrow(AppException)
    expect(rows[0]!.consumedAt).not.toBeNull()
  })

  it('refuses an expired code and burns it', async () => {
    const { service, rows, sent } = makeService()
    const code = await codeFor(service, sent)

    rows[0]!.expiresAt = new Date(Date.now() - 1000)

    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code }),
    ).rejects.toMatchObject({ code: ApiErrorCode.OTP_EXPIRED })
    expect(rows[0]!.consumedAt).not.toBeNull()
  })

  it('dies after CHALLENGE_MAX_ATTEMPTS wrong guesses', async () => {
    const { service, rows, sent } = makeService()
    const code = await codeFor(service, sent)
    const wrong = code === '000000' ? '111111' : '000000'

    for (let attempt = 1; attempt < CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      await expect(
        service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code: wrong }),
      ).rejects.toMatchObject({ code: ApiErrorCode.OTP_INCORRECT })
    }

    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code: wrong }),
    ).rejects.toMatchObject({ code: ApiErrorCode.OTP_TOO_MANY_ATTEMPTS })

    // Exhausted, so even the RIGHT code no longer works: the guesser has to
    // request a new one and wait out the resend window again.
    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code }),
    ).rejects.toThrow(AppException)
    expect(rows[0]!.consumedAt).not.toBeNull()
  })

  it('will not spend a reset code to sign in', async () => {
    const { service, rows, sent } = makeService()
    await service.issue({ purpose: ChallengePurpose.RESET_PASSWORD, identifier: PHONE })
    const code = lastCode(sent)

    // Same identifier, same live code, wrong purpose.
    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code }),
    ).rejects.toThrow(AppException)

    // And it is still good for what it was issued for.
    await expect(
      service.verify({ purpose: ChallengePurpose.RESET_PASSWORD, identifier: PHONE, code }),
    ).resolves.toEqual({ userId: null })
    expect(rows).toHaveLength(1)
  })

  it('invalidates the previous code when a new one is issued', async () => {
    const { service, rows, sent } = makeService()
    const first = await codeFor(service, sent)

    ageOutResendWindow(rows)
    await service.issue({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE })

    // Two live codes would double the guessing surface every time someone taps
    // "Send code again".
    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code: first }),
    ).rejects.toThrow(AppException)
    await expect(
      service.verify({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE, code: lastCode(sent) }),
    ).resolves.toEqual({ userId: null })
  })

  it('refuses a second code inside the resend window', async () => {
    const { service } = makeService()
    await service.issue({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE })

    // Otherwise "Send code again" is a free SMS button someone else pays for.
    await expect(
      service.issue({ purpose: ChallengePurpose.SIGN_IN, identifier: PHONE }),
    ).rejects.toMatchObject({ code: ApiErrorCode.OTP_RESEND_TOO_SOON })
  })
})
