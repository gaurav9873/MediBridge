import { Injectable } from '@nestjs/common'
import { ApiErrorCode, type BulkJobType } from '@medibridge/types'
import { AppException } from '../../common/errors/app-exception'
import type { AnyBulkHandler } from './bulk-handler'
import { InventoryStockUpdateHandler } from './inventory-stock-update.handler'
import { MedicineImportHandler } from './medicine-import.handler'

/**
 * Maps a job type to its handler.
 *
 * Adding a bulk operation means writing a handler and adding one line here.
 * Nothing else in the pipeline changes — the controller, the worker, the
 * wizard, templates, progress, reports and history are all type-agnostic.
 *
 * Types with no handler yet (INVENTORY_IMPORT, USER_IMPORT, the other update
 * variants) are declared in BulkJobType but not registered, so an upload for
 * one fails fast with a clear message rather than half-working.
 */
@Injectable()
export class BulkHandlerRegistry {
  private readonly handlers: Partial<Record<BulkJobType, AnyBulkHandler>>

  constructor(
    medicineImport: MedicineImportHandler,
    inventoryStockUpdate: InventoryStockUpdateHandler,
  ) {
    this.handlers = {
      // See AnyBulkHandler for why this cast is safe.
      MEDICINE_IMPORT: medicineImport as unknown as AnyBulkHandler,
      INVENTORY_STOCK_UPDATE: inventoryStockUpdate as unknown as AnyBulkHandler,
    }
  }

  get(type: BulkJobType): AnyBulkHandler {
    const handler = this.handlers[type]
    if (!handler) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          {
            field: 'type',
            message: 'This kind of bulk import is not available yet.',
          },
        ],
      })
    }
    return handler
  }

  /** Types that can actually be run today. Drives the UI's list. */
  availableTypes(): BulkJobType[] {
    return Object.keys(this.handlers) as BulkJobType[]
  }

  has(type: BulkJobType): boolean {
    return this.handlers[type] !== undefined
  }
}
