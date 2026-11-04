import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { AdminGuard } from './admin.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import type { AdminPrincipal } from './auth.service.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import {
  AdminUserListResponse,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto.js';
import { AdminUserResponse } from './dto/auth.dto.js';
import { Roles } from './roles.js';

/** ადმინკის მომხმარებლები — მხოლოდ superadmin */
@ApiTags('admin/users')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('admin/users')
@UseGuards(AdminGuard)
@Roles('superadmin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'მომხმარებლების სია' })
  @ApiOkResponse({ type: AdminUserListResponse })
  list(@Query() query: PageQueryDto): Promise<AdminUserListResponse> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ერთი მომხმარებელი' })
  @ApiOkResponse({ type: AdminUserResponse })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserResponse> {
    return this.users.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'ახალი მომხმარებლის რეგისტრაცია',
    description: '`409 EMAIL_TAKEN`. პაროლი მინიმუმ 10 სიმბოლო.',
  })
  @ApiCreatedResponse({ type: AdminUserResponse })
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<AdminUserResponse> {
    return this.users.create(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'მომხმარებლის შეცვლა: სახელი, როლები, გათიშვა, ახალი პაროლი',
    description:
      'პაროლის შეცვლა ან გათიშვა მომხმარებლის ყველა სესიას აუქმებს. `409 CANNOT_DEMOTE_SELF`, `409 LAST_SUPERADMIN`',
  })
  @ApiOkResponse({ type: AdminUserResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<AdminUserResponse> {
    return this.users.update(id, dto, admin);
  }
}
