import { Module } from '@nestjs/common'
import { FileStorage } from '../common/storage/file-storage'
import { DocumentService } from './document.service'
import { EmployeeService } from './employee.service'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'

/**
 * Registration and onboarding.
 *
 * FileStorage is provided here as well as in the bulk module — both need it,
 * neither owns it, and it holds no state worth sharing.
 */
@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, DocumentService, EmployeeService, FileStorage],
  exports: [OnboardingService, DocumentService],
})
export class OnboardingModule {}
