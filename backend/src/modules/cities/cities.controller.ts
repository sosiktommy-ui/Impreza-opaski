import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';
import { visibleCityIds } from '../../common/auth/scope.util';

class CreateCityDto {
  @IsString() countryId!: string;
  @IsString() @Length(1, 60) code!: string;
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cities')
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('countryId') countryId?: string) {
    const allowed = await visibleCityIds(this.prisma, user);
    const where: any = {};
    if (countryId) where.countryId = countryId;
    if (allowed !== null) where.id = { in: allowed };
    const cities = await this.prisma.city.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { country: true },
    });
    return cities.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isActive: c.isActive,
      countryId: c.countryId,
      countryCode: c.country.code,
      countryName: c.country.name,
    }));
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCityDto) {
    return this.prisma.city.create({
      data: {
        countryId: dto.countryId,
        code: dto.code.toLowerCase(),
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }
}
