import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  ApiErrorCode,
  BULK_LIMITS,
  type BulkJobListQuery,
  type BulkJobPreview,
  type BulkJobSummary,
  type BulkJobType,
  type Paginated,
  type SessionUser,
  bulkJobListQuerySchema,
  bulkUploadOptionsSchema,
} from '@medibridge/types'
import type { Response } from 'express'
import { AppException } from '../common/errors/app-exception'
import { CurrentUser } from '../auth/auth.guard'
import { BulkService } from './bulk.service'
import { BulkHandlerRegistry } from './handlers/registry'

/**
 * One controller for every bulk operation in the product.
 *
 * The `:type` parameter selects the handler, so medicines, inventory, pricing
 * and users all use these same endpoints. Adding a module adds no routes.
 */
@ApiTags('Bulk')
@Controller('bulk')
export class BulkController {
  constructor(
    private readonly bulk: BulkService,
    private readonly registry: BulkHandlerRegistry,
  ) {}

  @Get('types')
  @ApiOperation({ summary: 'Bulk operations available today' })
  availableTypes(): { types: BulkJobType[] } {
    return { types: this.registry.availableTypes() }
  }

  @Get('templates/:type')
  @ApiOperation({ summary: 'Download the blank template for a bulk operation' })
  async template(
    @Param('type') type: string,
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.bulk.buildTemplate(type as BulkJobType, user)
    res
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${type.toLowerCase()}-template.xlsx"`)
      .send(buffer)
  }

  @Post(':type/upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file and start validation' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: BULK_LIMITS.maxFileBytes } }))
  async upload(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: Record<string, string>,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    if (!file) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'file', message: 'Please choose a file to upload.' }],
      })
    }

    const options = bulkUploadOptionsSchema.parse(query)
    return this.bulk.createJob(type as BulkJobType, file, options, user)
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Import history' })
  list(
    @Query() query: Record<string, string>,
    @CurrentUser() user: SessionUser,
  ): Promise<Paginated<BulkJobSummary>> {
    const parsed: BulkJobListQuery = bulkJobListQuerySchema.parse(query)
    return this.bulk.list(parsed, user)
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Job status and progress — poll this while running' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    return this.bulk.getJob(id, user)
  }

  @Get('jobs/:id/preview')
  @ApiOperation({ summary: 'What the import would do, before confirming' })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobPreview> {
    return this.bulk.getPreview(id, user)
  }

  @Post('jobs/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a validated import' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    return this.bulk.confirm(id, user)
  }

  @Post('jobs/:id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a running import at the next batch boundary' })
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    return this.bulk.pause(id, user)
  }

  @Post('jobs/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume from the last completed batch' })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    return this.bulk.resume(id, user)
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop an import. Anything already imported is kept.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BulkJobSummary> {
    return this.bulk.cancel(id, user)
  }

  @Get('jobs/:id/errors.csv')
  @ApiOperation({ summary: 'Failed rows in template format, ready to fix and re-upload' })
  async errorFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName } = await this.bulk.openReport(id, 'errors', user)
    res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
    stream.pipe(res)
  }

  @Get('jobs/:id/result.csv')
  @ApiOperation({ summary: 'Row-by-row outcome of the import' })
  async resultFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName } = await this.bulk.openReport(id, 'result', user)
    res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
    stream.pipe(res)
  }
}
