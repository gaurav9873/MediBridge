import { Module } from '@nestjs/common'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'
import { StockTransferService } from './stock-transfer.service'

/**
 * A distributor's stock.
 *
 * Tenant data throughout — every query runs through Row-Level Security rather
 * than filtering by a company id in application code.
 *
 * The RULES are split by whose they are: expiry and shelf life are
 * pharmaceutical and live in @medibridge/types/medicine-rules, while counting,
 * reserving and low-stock thresholds are platform concerns and live in
 * inventory-rules. A second product category would bring its own expiry rules
 * and reuse the counting unchanged.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockTransferService],
  exports: [InventoryService, StockTransferService],
})
export class InventoryModule {}
