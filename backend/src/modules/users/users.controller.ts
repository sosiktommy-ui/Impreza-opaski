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
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { Role } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsEmail,
  MinLength,
  IsNumber,
} from 'class-validator';

const ROLE_HIERARCHY: Record<string, number> = {
  [Role.ADMIN]: 3,
  [Role.OFFICE]: 2,
  [Role.USER]: 1,
};

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

class CreateCountryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  officeId?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  countryId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
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
      cityId: user?.primaryCityId ?? undefined,
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
    // COUNTRY role can only see cities in its own country.
    // CITY can pick cities in any country (for outgoing transfers).
    let scopedCountryId = countryId;
    // No COUNTRY role exists — all users use primaryCityId
    return this.usersService.getCities(scopedCountryId);
  }

  @Post('countries')
  @Roles(Role.ADMIN, Role.OFFICE)
  createCountry(
    @Body() dto: CreateCountryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    return this.usersService.createCountry(dto, caller);
  }

  @Post('cities')
  @Roles(Role.ADMIN, Role.OFFICE)
  createCity(
    @Body() dto: CreateCityDto,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    return this.usersService.createCity(dto, caller);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  createUser(@Body() dto: CreateUserDto, @CurrentUser() caller: AuthenticatedUser) {
    if (caller.role !== Role.ADMIN && ROLE_HIERARCHY[dto.role] >= ROLE_HIERARCHY[caller.role]) {
      throw new ForbiddenException('Нельзя создать пользователя с ролью равной или выше вашей');
    }
    return this.usersService.createUser(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  async update(
    @Param('id') id: string,
    @Body() data: { displayName?: string; isActive?: boolean; email?: string },
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    const target = await this.usersService.findById(id);
    if (target && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[caller.role]) {
      throw new ForbiddenException('Нельзя редактировать пользователя с ролью равной или выше вашей');
    }
    return this.usersService.update(id, data);
  }

  @Patch(':id/password')
  @Roles(Role.ADMIN, Role.OFFICE)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    const target = await this.usersService.findById(id);
    if (target && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[caller.role]) {
      throw new ForbiddenException('Нельзя сбросить пароль пользователю с ролью равной или выше вашей');
    }
    return this.usersService.resetPassword(id, dto.newPassword);
  }

  @Get(':id/password')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getPassword(@Param('id') id: string, @CurrentUser() caller: AuthenticatedUser) {
    const target = await this.usersService.findById(id);
    if (target && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[caller.role]) {
      throw new ForbiddenException('Нельзя просматривать пароль пользователя с ролью равной или выше вашей');
    }
    return this.usersService.getPassword(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  async deleteUser(@Param('id') id: string, @CurrentUser() caller: AuthenticatedUser) {
    const target = await this.usersService.findById(id);
    if (target && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[caller.role]) {
      throw new ForbiddenException('Нельзя удалить пользователя с ролью равной или выше вашей');
    }
    return this.usersService.deleteUser(id);
  }
}
