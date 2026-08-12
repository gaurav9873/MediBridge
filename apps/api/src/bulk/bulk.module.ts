import { Module } from '@nestjs/common'
import { BulkController } from './bulk.controller'
import { BulkProcessor } from './bulk.processor'
import { BulkQueue, BulkWorker } from './bulk.queue'
import { BulkService } from './bulk.service'
import { InventoryImportHandler } from './handlers/inventory-import.handler'
import { InventoryStockUpdateHandler } from './handlers/inventory-stock-update.handler'
import { MedicineImportHandler } from './handlers/medicine-import.handler'
import { BulkHandlerRegistry } from './handlers/registry'
import { ReportWriter } from './parsing/report-writer'
import { FileStorage } from '../common/storage/file-storage'

/**
 * The bulk platform.
 *
 * Imported by both entrypoints: the API registers the controller and the
 * producer half of the queue; the worker (src/worker.ts) additionally starts
 * BulkWorker. Same code, two processes.
 */
@Module({
  controllers: [BulkController],
  providers: [
    FileStorage,
    ReportWriter,
    BulkHandlerRegistry,
    MedicineImportHandler,
    InventoryImportHandler,
    InventoryStockUpdateHandler,
    BulkProcessor,
    BulkQueue,
    BulkWorker,
    BulkService,
  ],
  exports: [BulkWorker, BulkService],
})
export class BulkModule {}
