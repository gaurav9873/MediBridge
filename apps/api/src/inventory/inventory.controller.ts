import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  Permission,
  type Paginated,
  type SessionUser,
  inventoryItemSchema,
  inventoryItemUpdateSchema,
  inventoryListSchema,
  stockTransferSchema,
} from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser } from '../auth/auth.guard'
import { RequirePermission } from '../auth/permission.guard'
import {
  InventoryService,
  type InventoryItemSummary,
  type InventorySummary,
} from './inventory.service'
import {
  StockTransferService,
  type StockTransferSummary,
  type WarehouseStock,
} from './stock-transfer.service'

/**
 * A distributor's own stock.
 *
 * Unlike the medicine catalogue, this is tenant data: every route is scoped by
 * Row-Level Security to the signed-in company, and no route takes a company id.
 * Reading needs INVENTORY_VIEW, changing needs INVENTORY_MANAGE — the split
 * exists so a sales executive can quote stock without being able to reprice it.
 *
 * There is no role check here on purpose. Which company's stock you see is a
 * tenancy question already answered by RLS; what you may do to it is a
 * permission question. A role name would add nothing either way.
 */
@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly transfers: StockTransferService,
  ) {}

  @RequirePermission(Permission.INVENTORY_VIEW)
  @Get()
  @ApiOperation({ summary: 'Your stock, filtered and paged' })
  async list(
    @Query() rawQuery: Record<string, string>,
  ): Promise<Paginated<InventoryItemSummary>> {
    return this.inventory.list(inventoryListSchema.parse(rawQuery))
  }

  // Declared before ':id' so the literal path is not swallowed by the param.
  @RequirePermission(Permission.INVENTORY_VIEW)
  @Get('summary')
  @ApiOperation({ summary: 'Counts for the stock dashboard' })
  async summary(): Promise<InventorySummary> {
    return this.inventory.summary()
  }

  @RequirePermission(Permission.INVENTORY_VIEW)
  @Get('warehouses')
  @ApiOperation({ summary: 'What each of your warehouses is holding' })
  async byWarehouse(): Promise<WarehouseStock[]> {
    return this.transfers.stockByWarehouse()
  }

  @RequirePermission(Permission.INVENTORY_VIEW)
  @Get('transfers')
  @ApiOperation({ summary: 'Recent stock movements between your warehouses' })
  async transferHistory(): Promise<StockTransferSummary[]> {
    return this.transfers.history()
  }

  @RequirePermission(Permission.INVENTORY_MANAGE)
  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Move stock to another of your warehouses' })
  async transfer(
    @CurrentUser() user: SessionUser,
    @Body(validate(stockTransferSchema)) body: Parameters<StockTransferService['transfer']>[1],
  ): Promise<StockTransferSummary> {
    return this.transfers.transfer(user, body)
  }

  @RequirePermission(Permission.INVENTORY_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'List a batch of stock' })
  async create(
    @CurrentUser() user: SessionUser,
    @Body(validate(inventoryItemSchema)) body: Parameters<InventoryService['create']>[1],
  ): Promise<InventoryItemSummary> {
    return this.inventory.create(user, body)
  }

  @RequirePermission(Permission.INVENTORY_VIEW)
  @Get(':id')
  @ApiOperation({ summary: 'One batch' })
  async get(@Param('id') id: string): Promise<InventoryItemSummary> {
    return this.inventory.get(id)
  }

  @RequirePermission(Permission.INVENTORY_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Change price, stock or availability' })
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(inventoryItemUpdateSchema)) body: Parameters<InventoryService['update']>[2],
  ): Promise<InventoryItemSummary> {
    return this.inventory.update(user, id, body)
  }

  @RequirePermission(Permission.INVENTORY_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a batch off your stock list' })
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.inventory.remove(user, id)
  }
}
