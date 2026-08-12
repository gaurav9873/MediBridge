import { Injectable } from '@nestjs/common'
import { ApiErrorCode, type BulkJobType, type SessionUser } from '@medibridge/types'
import { AppException } from '../../common/errors/app-exception'
import type { AnyBulkHandler } from './bulk-handler'
import { InventoryImportHandler } from './inventory-import.handler'
import { InventoryStockUpdateHandler } from './inventory-stock-update.handler'
import { MedicineImportHandler } from './medicine-import.handler'

/**
 * Maps a job type to its handler.
 *
 * Adding a bulk operation means writing a handler and adding one line here.
 * Nothing else in the pipeline changes — the controller, the worker, the
 * wizard, templates, progress, reports and history are all type-agnostic.
 *
 * Types with no handler yet (USER_IMPORT, the price/expiry/status update
 * variants) are declared in BulkJobType but not registered, so an upload for
 * one fails fast with a clear message rather than half-working.
 */
@Injectable()
export class BulkHandlerRegistry {
  private readonly handlers: Partial<Record<BulkJobType, AnyBulkHandler>>

  constructor(
    medicineImport: MedicineImportHandler,
    inventoryImport: InventoryImportHandler,
    inventoryStockUpdate: InventoryStockUpdateHandler,
  ) {
    this.handlers = {
      // See AnyBulkHandler for why this cast is safe.
      MEDICINE_IMPORT: medicineImport as unknown as AnyBulkHandler,
      INVENTORY_IMPORT: inventoryImport as unknown as AnyBulkHandler,
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

  /** Types that have a handler at all. */
  availableTypes(): BulkJobType[] {
    return Object.keys(this.handlers) as BulkJobType[]
  }

  /**
   * Types THIS user may actually run.
   *
   * Each handler's `authorize` is the authority on who it is for — an admin
   * imports medicines, a seller imports stock — so this asks it rather than
   * keeping a second list that could disagree. Offering someone an option that
   * fails the moment they upload a file is worse than not offering it.
   */
  availableTypesFor(user: SessionUser): BulkJobType[] {
    return this.availableTypes().filter((type) => {
      try {
        this.handlers[type]!.authorize(user)
        return true
      } catch {
        return false
      }
    })
  }

  has(type: BulkJobType): boolean {
    return this.handlers[type] !== undefined
  }
}
