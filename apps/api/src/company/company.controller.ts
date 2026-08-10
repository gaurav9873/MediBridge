import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  type SessionUser,
  companyBankSchema,
  companyBrandingSchema,
  companyProfileSchema,
  companyTermsSchema,
  warehouseSchema,
  warehouseUpdateSchema,
} from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser } from '../auth/auth.guard'
import { CompanyService, type CompanySettings, type WarehouseSummary } from './company.service'

/**
 * A company's own settings.
 *
 * No route takes a company id: the company is always the one on the session,
 * which is what stops a crafted request editing someone else's business.
 */
@ApiTags('Company')
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @ApiOperation({ summary: 'This company as it is configured today' })
  async settings(@CurrentUser() user: SessionUser): Promise<CompanySettings> {
    return this.company.settings(user)
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Business name and support contacts' })
  async updateProfile(
    @CurrentUser() user: SessionUser,
    @Body(validate(companyProfileSchema)) body: Parameters<CompanyService['updateProfile']>[1],
  ): Promise<CompanySettings> {
    return this.company.updateProfile(user, body)
  }

  @Patch('bank')
  @ApiOperation({ summary: 'Where weekly settlements are paid' })
  async updateBank(
    @CurrentUser() user: SessionUser,
    @Body(validate(companyBankSchema)) body: Parameters<CompanyService['updateBank']>[1],
  ): Promise<CompanySettings> {
    return this.company.updateBank(user, body)
  }

  @Patch('terms')
  @ApiOperation({ summary: 'Payment terms for this company' })
  async updateTerms(
    @CurrentUser() user: SessionUser,
    @Body(validate(companyTermsSchema)) body: Parameters<CompanyService['updateTerms']>[1],
  ): Promise<CompanySettings> {
    return this.company.updateTerms(user, body)
  }

  @Patch('branding')
  @ApiOperation({ summary: 'Logo, colour and login image' })
  async updateBranding(
    @CurrentUser() user: SessionUser,
    @Body(validate(companyBrandingSchema)) body: Parameters<CompanyService['updateBranding']>[1],
  ): Promise<CompanySettings> {
    return this.company.updateBranding(user, body)
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Places this company ships from' })
  async listWarehouses(@CurrentUser() user: SessionUser): Promise<WarehouseSummary[]> {
    return this.company.listWarehouses(user)
  }

  @Post('warehouses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a warehouse' })
  async createWarehouse(
    @CurrentUser() user: SessionUser,
    @Body(validate(warehouseSchema)) body: Parameters<CompanyService['createWarehouse']>[1],
  ): Promise<WarehouseSummary[]> {
    return this.company.createWarehouse(user, body)
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Change a warehouse and its delivery settings' })
  async updateWarehouse(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(warehouseUpdateSchema)) body: Parameters<CompanyService['updateWarehouse']>[2],
  ): Promise<WarehouseSummary[]> {
    return this.company.updateWarehouse(user, id, body)
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: 'Close a warehouse' })
  async deleteWarehouse(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<WarehouseSummary[]> {
    return this.company.deleteWarehouse(user, id)
  }
}
