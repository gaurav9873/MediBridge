import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminListsController } from './admin-lists.controller'
import { ApprovalsController } from './approvals.controller'
import { ApprovalsService } from './approvals.service'

@Module({
  controllers: [AdminController, AdminListsController, ApprovalsController],
  providers: [ApprovalsService],
})
export class AdminModule {}
