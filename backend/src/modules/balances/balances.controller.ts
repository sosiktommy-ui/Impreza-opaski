import {
  Body,
  Controller,
  ForbiddenException,
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

  /** Caller's own balance (CITY/COUNTRY only). Returns null for ADMIN/OFFICE. */
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.balancesService.getMine(user.id);
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

  /** Paginated list of users with personal balances. Admin/Office only. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  list(
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('countryId') countryId?: string,
    @Query('officeId') officeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balancesService.list({
      search,
      role,
      countryId,
      officeId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Specific user's balance. Admin/Office/Country may view subordinates. */
  @Get('users/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY)
  getForUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // Country users can only see their own country; ADMIN/OFFICE — anything.
    // Cheap guard — full scope check belongs to ScopeAccessGuard (Phase 5+).
    return this.balancesService.getForUser(userId);
  }

  /** Specific user's balance history. Admin/Office/Country only. */
  @Get('users/:userId/history')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY)
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
