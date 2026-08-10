import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Permission, type SessionUser, assignRoleSchema, roleSchema } from '@medibridge/types'
import { validate } from '../common/pipes/zod-validation.pipe'
import { CurrentUser } from './auth.guard'
import { RequirePermission } from './permission.guard'
import { RoleService, type PermissionGroup, type RoleSummary } from './role.service'

/**
 * Who can do what, inside the caller's own company.
 *
 * No route takes a company id — roles belong to the company on the session,
 * and Row-Level Security means another company's role is not merely forbidden
 * but invisible.
 */
@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @RequirePermission(Permission.EMPLOYEE_VIEW)
  @Get()
  @ApiOperation({ summary: 'Roles in this company, with permissions and member counts' })
  async list(@CurrentUser() user: SessionUser): Promise<RoleSummary[]> {
    return this.roles.list(user)
  }

  /** Static, so the browser may cache it: these keys ship with the code. */
  @RequirePermission(Permission.EMPLOYEE_VIEW)
  @Get('permissions')
  @ApiOperation({ summary: 'The permission catalogue, grouped and in plain words' })
  catalogue(): PermissionGroup[] {
    return this.roles.catalogue()
  }

  @RequirePermission(Permission.ROLE_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a role of this company’s own' })
  async create(
    @CurrentUser() user: SessionUser,
    @Body(validate(roleSchema)) body: { name: string; permissions: string[] },
  ): Promise<RoleSummary[]> {
    return this.roles.create(user, { name: body.name, permissions: body.permissions as Permission[] })
  }

  @RequirePermission(Permission.ROLE_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Change what a role can do' })
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(validate(roleSchema)) body: { name: string; permissions: string[] },
  ): Promise<RoleSummary[]> {
    return this.roles.update(user, id, {
      name: body.name,
      permissions: body.permissions as Permission[],
    })
  }

  @RequirePermission(Permission.ROLE_MANAGE)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom role' })
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<RoleSummary[]> {
    return this.roles.remove(user, id)
  }

  @RequirePermission(Permission.ROLE_MANAGE)
  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Give a team member a role' })
  async assign(
    @CurrentUser() user: SessionUser,
    @Body(validate(assignRoleSchema)) body: { userId: string; roleId: string },
  ): Promise<{ assigned: true }> {
    await this.roles.assign(user, body.userId, body.roleId)
    return { assigned: true }
  }
}
