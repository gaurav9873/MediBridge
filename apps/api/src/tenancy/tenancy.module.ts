import { Global, Module } from '@nestjs/common'
import { CapabilityService } from './capability.service'
import { TenantContextService } from './tenant-context'
import { TenantPrismaService } from './tenant-prisma.service'

/**
 * Global because tenant context is needed by every module, and threading it
 * through imports would make it optional — which is exactly what it must not be.
 */
@Global()
@Module({
  providers: [TenantContextService, TenantPrismaService, CapabilityService],
  exports: [TenantContextService, TenantPrismaService, CapabilityService],
})
export class TenancyModule {}
