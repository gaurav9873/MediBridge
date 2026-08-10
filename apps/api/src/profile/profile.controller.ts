import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  type ChallengeIssued,
  type SessionUser,
  addressSchema,
  notificationSettingSchema,
  profileSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { type AuthenticatedRequest, CurrentUser } from '../auth/auth.guard'
import { Req } from '@nestjs/common'
import {
  ProfileService,
  type AddressSummary,
  type NotificationSetting,
  type ProfileSummary,
} from './profile.service'

/**
 * Your own account.
 *
 * Every route acts on the caller. No userId is ever accepted, so editing your
 * own name is never one crafted request away from editing a colleague's.
 */
@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Your account as we hold it' })
  async get(@CurrentUser() user: SessionUser): Promise<ProfileSummary> {
    return this.profile.get(user)
  }

  @Patch()
  @ApiOperation({ summary: 'Change your name or email' })
  async update(
    @CurrentUser() user: SessionUser,
    @Body(validate(profileSchema)) body: { fullName: string; email: string },
  ): Promise<ProfileSummary> {
    return this.profile.update(user, body)
  }

  @Post('phone/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a code to a new mobile number' })
  async requestPhoneChange(
    @CurrentUser() user: SessionUser,
    @Body(validate(requestOtpSchema)) body: { phone: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ challenge: ChallengeIssued }> {
    return { challenge: await this.profile.requestPhoneChange(user, body.phone, req.ip) }
  }

  @Post('phone/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the new mobile number' })
  async confirmPhoneChange(
    @CurrentUser() user: SessionUser,
    @Body(validate(verifyOtpSchema)) body: { phone: string; code: string },
  ): Promise<ProfileSummary> {
    return this.profile.confirmPhoneChange(user, body.phone, body.code)
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Your delivery addresses' })
  async listAddresses(@CurrentUser() user: SessionUser): Promise<AddressSummary[]> {
    return this.profile.listAddresses(user)
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a delivery address' })
  async addAddress(
    @CurrentUser() user: SessionUser,
    @Body(validate(addressSchema)) body: Parameters<ProfileService['addAddress']>[1],
  ): Promise<AddressSummary[]> {
    return this.profile.addAddress(user, body)
  }

  @Post('addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use this address by default' })
  async setDefaultAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AddressSummary[]> {
    return this.profile.setDefaultAddress(user, id)
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Remove an address' })
  async removeAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AddressSummary[]> {
    return this.profile.removeAddress(user, id)
  }

  @Get('notifications')
  @ApiOperation({ summary: 'What we tell you about, and how' })
  async notifications(@CurrentUser() user: SessionUser): Promise<NotificationSetting[]> {
    return this.profile.notificationSettings(user)
  }

  @Patch('notifications')
  @ApiOperation({ summary: 'Turn one notification on or off' })
  async setNotification(
    @CurrentUser() user: SessionUser,
    @Body(validate(notificationSettingSchema)) body: Parameters<ProfileService['setNotification']>[1],
  ): Promise<NotificationSetting[]> {
    return this.profile.setNotification(user, body)
  }
}
