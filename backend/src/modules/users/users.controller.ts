import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
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
  getCountries() {
    return this.usersService.getCountries();
  }

  @Get('cities')
  getCities(@Query('countryId') countryId?: string) {
    return this.usersService.getCities(countryId);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() data: { displayName?: string; isActive?: boolean; email?: string },
  ) {
    return this.usersService.update(id, data);
  }
}
