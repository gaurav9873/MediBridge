import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  Permission,
  UserRole,
  type Paginated,
  type SessionUser,
  medicineListSchema,
  medicineRequestSchema,
  medicineSchema,
  mergeMedicineSchema,
  rejectApplicationSchema,
} from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser, Roles } from '../auth/auth.guard'
import { RequirePermission } from '../auth/permission.guard'
import { MedicineRequestService, type MedicineRequestSummary } from './medicine-request.service'
import { MedicineService, type DuplicateCandidate, type MedicineSummary } from './medicine.service'

/**
 * The global medicine catalogue.
 *
 * Reading it needs PRODUCT_VIEW — every seller and buyer has that.
 *
 * Changing it needs PRODUCT_MANAGE **and** the ADMIN role. The permission alone
 * is not enough: COMPANY_ADMIN bundles every non-platform key, so every
 * company owner holds PRODUCT_MANAGE — and this is one catalogue shared by all
 * of them. A distributor editing it would be editing everybody's, which is
 * exactly what a test caught before this line existed.
 *
 * A distributor who needs something added asks for it instead. That is what the
 * request endpoints are.
 */
@ApiTags('Medicines')
@Controller('medicines')
export class MedicineController {
  constructor(
    private readonly medicines: MedicineService,
    private readonly requests: MedicineRequestService,
  ) {}

  @RequirePermission(Permission.PRODUCT_VIEW)
  @Get()
  @ApiOperation({ summary: 'Browse the catalogue with filters and paging' })
  async list(@Query() rawQuery: Record<string, string>): Promise<Paginated<MedicineSummary>> {
    return this.medicines.list(medicineListSchema.parse(rawQuery))
  }

  // Declared before ':id' so the literal path is not swallowed by the param.
  @RequirePermission(Permission.PRODUCT_VIEW)
  @Get('requests/mine')
  @ApiOperation({ summary: 'Medicines this company has asked for' })
  async myRequests(@CurrentUser() user: SessionUser): Promise<MedicineRequestSummary[]> {
    return this.requests.listMine(user)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Get('requests/pending')
  @ApiOperation({ summary: 'Requests waiting for a decision' })
  async pendingRequests(): Promise<MedicineRequestSummary[]> {
    return this.requests.listPending()
  }

  @RequirePermission(Permission.PRODUCT_VIEW)
  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ask for a medicine that is missing' })
  async request(
    @CurrentUser() user: SessionUser,
    @Body(validate(medicineRequestSchema)) body: Parameters<MedicineRequestService['request']>[1],
  ) {
    return this.requests.request(user, body)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post('requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a request by adding the medicine' })
  async approveRequest(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(medicineSchema)) body: Parameters<MedicineService['create']>[1],
  ): Promise<{ medicineId: string }> {
    return this.requests.approve(user, id, body)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refuse a request, with a reason' })
  async rejectRequest(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(rejectApplicationSchema)) body: { reason: string },
  ): Promise<{ rejected: true }> {
    await this.requests.reject(user, id, body.reason)
    return { rejected: true }
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge a duplicate into the medicine that survives' })
  async merge(
    @CurrentUser() user: SessionUser,
    @Body(validate(mergeMedicineSchema)) body: { keepId: string; mergeId: string },
  ): Promise<{ moved: number; collided: number }> {
    return this.medicines.merge(user, body)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a medicine to the catalogue' })
  async create(
    @CurrentUser() user: SessionUser,
    @Body(validate(medicineSchema)) body: Parameters<MedicineService['create']>[1],
  ): Promise<MedicineSummary> {
    return this.medicines.create(user, body)
  }

  @RequirePermission(Permission.PRODUCT_VIEW)
  @Get(':id')
  @ApiOperation({ summary: 'One medicine' })
  async get(@Param('id') id: string): Promise<MedicineSummary> {
    return this.medicines.get(id)
  }

  @RequirePermission(Permission.PRODUCT_VIEW)
  @Get(':id/duplicates')
  @ApiOperation({ summary: 'Medicines that look like this one' })
  async duplicates(@Param('id') id: string): Promise<DuplicateCandidate[]> {
    return this.medicines.findDuplicates(id)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit a medicine' })
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(medicineSchema)) body: Parameters<MedicineService['update']>[2],
  ): Promise<MedicineSummary> {
    return this.medicines.update(user, id, body)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a medicine out of search, keeping its history' })
  async archive(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<MedicineSummary> {
    return this.medicines.setArchived(user, id, true)
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission(Permission.PRODUCT_MANAGE)
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put an archived medicine back' })
  async restore(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<MedicineSummary> {
    return this.medicines.setArchived(user, id, false)
  }
}
