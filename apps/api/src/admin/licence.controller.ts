import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type SessionUser, UserRole, rejectApplicationSchema } from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser, Roles } from '../auth/auth.guard'
import { LicenceService, type DocumentReview } from './licence.service'

/**
 * Reviewing drug licences and GST certificates.
 *
 * Per document rather than per application: refusing a blurry GST certificate
 * should not throw away a perfectly good drug licence uploaded beside it.
 */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/licences')
export class LicenceController {
  constructor(private readonly licences: LicenceService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Documents waiting for a decision' })
  async pending(): Promise<DocumentReview[]> {
    return this.licences.pending()
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Approved licences about to lapse' })
  async expiring(@Query('days') days?: string): Promise<DocumentReview[]> {
    const withinDays = Number(days)
    return this.licences.expiring(Number.isFinite(withinDays) && withinDays > 0 ? withinDays : undefined)
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept one document' })
  async approve(
    @CurrentUser() admin: SessionUser,
    @Param('id') id: string,
  ): Promise<{ accountActivated: boolean }> {
    return this.licences.approveDocument(id, admin.id)
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuse one document, with a reason' })
  async reject(
    @CurrentUser() admin: SessionUser,
    @Param('id') id: string,
    @Body(validate(rejectApplicationSchema)) body: { reason: string },
  ): Promise<{ documentId: string }> {
    return this.licences.rejectDocument(id, admin.id, body.reason)
  }
}
