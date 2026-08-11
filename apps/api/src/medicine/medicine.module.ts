import { Module } from '@nestjs/common'
import { MedicineController } from './medicine.controller'
import { MedicineRequestService } from './medicine-request.service'
import { MedicineService } from './medicine.service'

/**
 * The medicine domain.
 *
 * The catalogue and the requests to change it. The RULES — what may be sold,
 * what needs a prescription, what counts as the same medicine — live in
 * @medibridge/types/medicine-rules, so the platform core never has to know what
 * Schedule H means.
 */
@Module({
  controllers: [MedicineController],
  providers: [MedicineService, MedicineRequestService],
  exports: [MedicineService, MedicineRequestService],
})
export class MedicineModule {}
