import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  ApiErrorCode,
  type SessionUser,
  employeeInviteSchema,
  signUpBusinessSchema,
  uploadDocumentSchema,
} from '@medibridge/types'
import type { Response } from 'express'
import { AppException } from '../common/errors/app-exception'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser } from '../auth/auth.guard'
import { DocumentService, type DocumentSummary } from './document.service'
import { EmployeeService, type EmployeeSummary } from './employee.service'
import { OnboardingService, type OnboardingStatus } from './onboarding.service'

/**
 * Turning an account into a trading business, and staffing it.
 *
 * Everything here needs a session — unlike sign-up, which is public. The
 * company a request applies to always comes from that session, never from the
 * body, so no payload can reach another tenant.
 */
@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly documents: DocumentService,
    private readonly employees: EmployeeService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'What the onboarding wizard should show next' })
  async status(@CurrentUser() user: SessionUser): Promise<OnboardingStatus> {
    return this.onboarding.status(user)
  }

  @Post('business')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record business details and the trading address' })
  async submitBusiness(
    @CurrentUser() user: SessionUser,
    @Body(validate(signUpBusinessSchema)) body: Parameters<OnboardingService['submitBusiness']>[1],
  ): Promise<OnboardingStatus> {
    return this.onboarding.submitBusiness(user, body)
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  @Get('documents')
  @ApiOperation({ summary: 'Documents uploaded by this account' })
  async listDocuments(@CurrentUser() user: SessionUser): Promise<DocumentSummary[]> {
    return this.documents.list(user)
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a drug licence or GST certificate' })
  async uploadDocument(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(validate(uploadDocumentSchema)) body: { type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'; number: string; expiresOn?: Date },
  ): Promise<DocumentSummary> {
    if (!file) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'file', message: 'Please choose a file to upload.' }],
      })
    }
    return this.documents.upload(user, { ...body, file })
  }

  /** Streamed rather than served from a path, so access can be checked. */
  @Get('documents/:id/file')
  @ApiOperation({ summary: 'Download a document' })
  async downloadDocument(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.openFile(id, user)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`)
    file.stream.pipe(res)
  }

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  @Get('employees')
  @ApiOperation({ summary: 'People who work for this company' })
  async listEmployees(@CurrentUser() user: SessionUser): Promise<EmployeeSummary[]> {
    return this.employees.list(user)
  }

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a colleague and get their temporary password' })
  async inviteEmployee(
    @CurrentUser() user: SessionUser,
    @Body(validate(employeeInviteSchema)) body: Parameters<EmployeeService['invite']>[1],
  ): Promise<{ employee: EmployeeSummary; temporaryPassword: string }> {
    return this.employees.invite(user, body)
  }

  @Delete('employees/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a colleague' })
  async removeEmployee(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    await this.employees.remove(user, id)
    return { removed: true }
  }
}
