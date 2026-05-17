import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { BalancesService } from './balances.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';

@Controller('balances')
@UseGuards(JwtAuthGuard)
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  /** Caller's own balance (USER only). Returns null for ADMIN/OFFICE. */
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.balancesService.getMine(user.id);
  }

  /** Hierarchical drill-down: admins + offices→countries→cities→users. */
  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getOverview() {
    return this.balancesService.getOverview();
  }

  /** Caller's own balance history. */
  @Get('me/history')
  getMyHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.getHistory(user.id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Paginated list of USER accounts with personal balances. Admin/Office only. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  list(
    @Query('search') search?: string,
    @Query('cityId') cityId?: string,
    @Query('officeId') officeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.list({
      search,
      cityId,
      officeId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Aggregate balance for a city (SUM of all user balances in city). */
  @Get('city/:cityId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getCityBalance(@Param('cityId') cityId: string) {
    return this.balancesService.getCityBalance(cityId);
  }

  /** Aggregate balance for a country (SUM of all city balances). */
  @Get('country/:countryId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getCountryBalance(@Param('countryId') countryId: string) {
    return this.balancesService.getCountryBalance(countryId);
  }

  /** Specific user's balance. Admin/Office only. */
  @Get('users/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getForUser(@Param('userId') userId: string) {
    return this.balancesService.getForUser(userId);
  }

  /** Specific user's balance history. Admin/Office only. */
  @Get('users/:userId/history')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getUserHistory(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.getHistory(userId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Manual balance adjustment. Admin/Office only. */
  @Post('adjust')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  adjust(
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.balancesService.adjust({
      userId: dto.userId,
      color: dto.color,
      delta: dto.delta,
      reason: dto.reason,
      actorId: actor.id,
    });
  }
}

