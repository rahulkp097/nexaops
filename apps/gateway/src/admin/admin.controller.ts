import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/types/request-user.type';
import { AdminService } from './admin.service';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Every route here is ADMIN-only (spec §11: "ADMIN: user/document/evaluation
// administration"), so the guard is applied once at the class level rather
// than repeated per method.
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@CurrentUser() user: RequestUser): Promise<AdminUserResponseDto[]> {
    return this.adminService.listUsers(user.organizationId);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AdminUserResponseDto> {
    return this.adminService.updateUser(id, dto, user);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuditLogResponseDto[]> {
    return this.adminService.listAuditLogs(user.organizationId, query.limit ?? 100);
  }
}
