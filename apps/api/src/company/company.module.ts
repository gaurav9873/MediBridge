import { Module } from '@nestjs/common'
import { CompanyController } from './company.controller'
import { CompanyService } from './company.service'

/** A company's own settings: profile, bank, terms, branding, warehouses. */
@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
