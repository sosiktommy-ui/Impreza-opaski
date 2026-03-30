import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsEmail, MinLength } from 'class-validator';

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(Role)
  role!: Role;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsString()
  @IsOptional()
  officeId?: string;

  @IsString()
  @IsOptional()
  countryId?: string;

  @IsString()
  @IsOptional()
  cityId?: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE)
  findAll(
    @Query('role') role?: Role,
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.findAll({ role, countryId, search, page, limit });
  }

  @Get('countries')
  getCountries(@CurrentUser() user?: AuthenticatedUser) {
    return this.usersService.getCountries({
      role: user?.role,
      countryId: user?.countryId ?? undefined,
      cityId: user?.cityId ?? undefined,
    });
  }

  @Get('offices')
  @Roles(Role.ADMIN, Role.OFFICE)
  getOffices() {
    return this.usersService.getOffices();
  }

  @Get('cities')
  getCities(
    @CurrentUser() user: AuthenticatedUser,
    @Query('countryId') countryId?: string,
  ) {
    // COUNTRY/CITY roles can only see cities in their own country
    let scopedCountryId = countryId;
    if (user.role === 'COUNTRY' || user.role === 'CITY') {
      scopedCountryId = user.countryId ?? undefined;
    }
    return this.usersService.getCities(scopedCountryId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  createUser(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  update(
    @Param('id') id: string,
    @Body() data: { displayName?: string; isActive?: boolean; email?: string },
  ) {
    return this.usersService.update(id, data);
  }

  @Patch(':id/password')
  @Roles(Role.ADMIN, Role.OFFICE)
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
