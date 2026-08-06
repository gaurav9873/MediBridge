import { Global, Module } from '@nestjs/common'
import { CapabilityService } from './capability.service'
import { TenantController } from './tenant.controller'
import { TenantContextService } from './tenant-context'
import { TenantPrismaService } from './tenant-prisma.service'
import { TenantResolverService } from './tenant-resolver.service'

/**
 * Global because tenant context is needed by every module, and threading it
 * through imports would make it optional — which is exactly what it must not be.
 */
@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantContextService, TenantPrismaService, CapabilityService, TenantResolverService],
  exports: [TenantContextService, TenantPrismaService, CapabilityService, TenantResolverService],
})
export class TenancyModule {}
