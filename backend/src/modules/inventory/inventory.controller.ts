import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { IntakeDto } from './dto/intake.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get()
  byCity(@CurrentUser() user: AuthUser) {
    return this.inv.byCity(user);
  }

  @Get('by-country')
  byCountry(@CurrentUser() user: AuthUser) {
    return this.inv.byCountry(user);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.inv.stats(user);
  }

  @Roles(Role.ADMIN, Role.OFFICE)
  @Post('intake')
  intake(@Body() dto: IntakeDto, @CurrentUser() actor: AuthUser) {
    return this.inv.intake(dto, actor);
  }
}
