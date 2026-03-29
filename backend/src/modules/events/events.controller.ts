import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role } from '@prisma/client';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  async getEvents(
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('active') active?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    // Auto-filter for CITY role: only show events in their city
    if (user?.role === Role.CITY && user.cityId && !city) {
      const cityEntity = await this.prisma.city.findUnique({
        where: { id: user.cityId },
        select: { name: true },
      });
      if (cityEntity) city = cityEntity.name;
    }

    // Auto-filter for COUNTRY role: only show events in their country
    if (user?.role === Role.COUNTRY && user.countryId && !country) {
      const countryEntity = await this.prisma.country.findUnique({
        where: { id: user.countryId },
        select: { code: true },
      });
      if (countryEntity) country = countryEntity.code;
    }

    return this.eventsService.getEvents({ city, country, active: active === 'true' });
  }
}
