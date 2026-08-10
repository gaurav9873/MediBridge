import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  Permission,
  type PendingApplication,
  type RejectApplicationInput,
  type SessionUser,
  UserRole,
  rejectApplicationSchema,
} from '@medibridge/types'
import { CurrentUser, Roles } from '../auth/auth.guard'
import { RequirePermission } from '../auth/permission.guard'
import { validate } from '../common/pipes/zod-validation.pipe'
import { ApprovalsService } from './approvals.service'

@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @RequirePermission(Permission.CUSTOMER_VIEW)
  @Get()
  @ApiOperation({ summary: 'Businesses waiting for document verification' })
  list(): Promise<PendingApplication[]> {
    return this.approvals.listPending()
  }

  @RequirePermission(Permission.CUSTOMER_APPROVE)
  @Post(':userId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a business so it can start ordering' })
  approve(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ userId: string }> {
    return this.approvals.approve(userId, admin.id)
  }

  @RequirePermission(Permission.CUSTOMER_APPROVE)
  @Post(':userId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject the uploaded documents with a reason' })
  reject(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(validate(rejectApplicationSchema)) body: RejectApplicationInput,
    @CurrentUser() admin: SessionUser,
  ): Promise<{ userId: string }> {
    return this.approvals.reject(userId, admin.id, body.reason)
  }
}
