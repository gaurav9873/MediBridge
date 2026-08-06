import { Controller, Get, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type TenantBranding } from '@medibridge/types'
import type { Request } from 'express'
import { Public } from '../auth/auth.guard'
import { AuthProviderRegistry } from '../auth/providers/auth-provider.registry'
import { PrismaService } from '../common/prisma/prisma.service'
import { TenantResolverService } from './tenant-resolver.service'

/**
 * The white-label bootstrap.
 *
 * Public on purpose: a client needs the tenant's name, logo and colour BEFORE
 * anyone signs in, to render its own login screen. One endpoint serves the web
 * portal, the mobile app and any future client, so branding never drifts
 * between them.
 */
@ApiTags('Tenant')
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly resolver: TenantResolverService,
    private readonly prisma: PrismaService,
    private readonly providers: AuthProviderRegistry,
  ) {}

  @Public()
  @Get('branding')
  @ApiOperation({ summary: 'Branding and sign-in options for the resolved tenant' })
  async branding(@Req() request: Request): Promise<TenantBranding | null> {
    const resolved = await this.resolver.resolve({
      host: request.get('host') ?? '',
      path: request.path,
      headers: request.headers as Record<string, string | string[] | undefined>,
    })
    if (!resolved) return null

    const company = await this.prisma.company.findUnique({
      where: { id: resolved.companyId },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        brandColor: true,
        loginImageUrl: true,
        supportEmail: true,
        supportPhone: true,
        businessMode: true,
      },
    })
    if (!company) return null

    return {
      companyId: company.id,
      slug: company.slug,
      name: company.name,
      logoUrl: company.logoUrl,
      brandColor: company.brandColor,
      loginImageUrl: company.loginImageUrl,
      supportEmail: company.supportEmail,
      supportPhone: company.supportPhone,
      authMethods: await this.providers.enabledFor(company.id),
      // Only a marketplace lets buyers walk in off the street; a private
      // distributor's customers are invited.
      allowsSelfSignup: company.businessMode === 'MARKETPLACE',
    }
  }
}
