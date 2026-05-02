import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';
import { visibleCountryIds } from '../../common/auth/scope.util';

class CreateCountryDto {
  @IsString() @Length(2, 4)
  code!: string;
  @IsString() @Length(1, 80)
  name!: string;
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('countries')
export class CountriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const allowed = await visibleCountryIds(this.prisma, user);
    const countries = await this.prisma.country.findMany({
      where: allowed === null ? undefined : { id: { in: allowed } },
      orderBy: { name: 'asc' },
      include: { cities: { orderBy: { name: 'asc' } } },
    });
    return countries.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isActive: c.isActive,
      cities: c.cities.map((ct) => ({ id: ct.id, code: ct.code, name: ct.name, isActive: ct.isActive })),
    }));
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCountryDto) {
    return this.prisma.country.create({
      data: { code: dto.code.toUpperCase(), name: dto.name, isActive: dto.isActive ?? true },
    });
  }
}
