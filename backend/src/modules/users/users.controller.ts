import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  ReplaceAccessesDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN, Role.OFFICE)
  @Get()
  list() {
    return this.users.list();
  }

  @Roles(Role.ADMIN, Role.OFFICE)
  @Get(':id')
  byId(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.softDelete(id, actor);
  }

  @Roles(Role.ADMIN)
  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPassword(id, dto.newPassword, actor);
  }

  @Roles(Role.ADMIN)
  @Put(':id/accesses')
  replaceAccesses(
    @Param('id') id: string,
    @Body() dto: ReplaceAccessesDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.replaceAccesses(id, dto, actor);
  }
}
