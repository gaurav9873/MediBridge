import { Injectable, Logger } from '@nestjs/common'
import type { ChallengePurpose, OtpSenderContract } from '@medibridge/types'

/**
 * Development delivery: writes the code to the server log.
 *
 * The seam that matters is the contract, not this class. A real gateway —
 * MSG91, Twilio, AWS SNS — is one class implementing `OtpSenderContract` and
 * one line in `auth.module.ts`. Nothing about how codes are generated, expired,
 * counted or spent changes with it, because none of that lives here.
 */
@Injectable()
export class ConsoleOtpSender implements OtpSenderContract {
  readonly channel = 'CONSOLE' as const
  private readonly logger = new Logger('OTP')

  async send(identifier: string, code: string, purpose: ChallengePurpose): Promise<void> {
    this.logger.log(`${purpose} code for ${identifier}: ${code}`)
  }
}
