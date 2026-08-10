import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminListsController } from './admin-lists.controller'
import { ApprovalsController } from './approvals.controller'
import { LicenceController } from './licence.controller'
import { LicenceService } from './licence.service'
import { ApprovalsService } from './approvals.service'

@Module({
  controllers: [AdminController, AdminListsController, ApprovalsController, LicenceController],
  providers: [ApprovalsService, LicenceService],
})
export class AdminModule {}
