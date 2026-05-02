import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly svc: HistoryService) {}

  @Get()
  feed(
    @CurrentUser() user: AuthUser,
    @Query('tab') tab?: 'all' | 'mine' | 'country' | 'city' | 'user',
    @Query('userId') userId?: string,
    @Query('cityId') cityId?: string,
    @Query('countryId') countryId?: string,
    @Query('action') action?: AuditAction,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.feed(user, {
      tab,
      userId,
      cityId,
      countryId,
      action,
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }
}
