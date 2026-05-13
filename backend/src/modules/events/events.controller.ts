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
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  async getEvents(
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('active') active?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    // Auto-filter for USER role: show events for their primary city
    if (user?.role === Role.USER && user.primaryCityId) {
      const cityEntity = await this.prisma.city.findUnique({
        where: { id: user.primaryCityId },
        select: { name: true },
      });
      if (cityEntity && !city) city = cityEntity.name;
    }

    return this.eventsService.getEvents({ city, country, active: active === 'true' });
  }
}
