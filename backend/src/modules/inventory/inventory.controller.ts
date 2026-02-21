import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { Role, EntityType, ItemType } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

class AdjustBalanceDto {
  @IsEnum(EntityType)
  entityType!: EntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsInt()
  delta!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  cityId!: string;

  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(Role.ADMIN)
  getAllBalances() {
    return this.inventoryService.getAllBalances();
  }

  @Get('my')
  getMyBalance(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.CITY && user.cityId) {
      return this.inventoryService.getBalance(EntityType.CITY, user.cityId);
    }
    if (user.role === Role.COUNTRY && user.countryId) {
      return this.inventoryService.getBalancesByCountry(user.countryId);
    }
    if (user.role === Role.ADMIN) {
      return this.inventoryService.getAllBalances();
    }
    return {};
  }

  @Get('country/:countryId')
  @Roles(Role.ADMIN, Role.COUNTRY)
  getByCountry(@Param('countryId') countryId: string) {
    return this.inventoryService.getBalancesByCountry(countryId);
  }

  @Get(':entityType/:entityId')
  @Roles(Role.ADMIN)
  getBalance(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.inventoryService.getBalance(entityType, entityId);
  }

  @Post('adjust')
  @Roles(Role.ADMIN)
  adjustBalance(
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.adjustBalance({
      ...dto,
      actorId: user.id,
    });
  }

  @Post('expense')
  @Roles(Role.CITY)
  createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createExpense({
      ...dto,
      actorId: user.id,
    });
  }
}
