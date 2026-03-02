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
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  eventName!: string;

  @IsString()
  @IsOptional()
  eventDate?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsInt()
  @Min(0)
  black!: number;

  @IsInt()
  @Min(0)
  white!: number;

  @IsInt()
  @Min(0)
  red!: number;

  @IsInt()
  @Min(0)
  blue!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE)
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
    if (user.role === Role.ADMIN || user.role === Role.OFFICE) {
      return this.inventoryService.getAllBalances();
    }
    return {};
  }

  @Get('country/:countryId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY)
  getByCountry(@Param('countryId') countryId: string) {
    return this.inventoryService.getBalancesByCountry(countryId);
  }

  // Static routes MUST come before parameterised routes
  @Get('expenses')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  getExpenses(
    @Query('cityId') cityId?: string,
    @Query('countryId') countryId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    let scopedCityId = cityId;
    let scopedCountryId = countryId;

    if (user?.role === Role.CITY && user.cityId) {
      scopedCityId = user.cityId;
    } else if (user?.role === Role.COUNTRY && user.countryId) {
      scopedCountryId = user.countryId;
    }

    return this.inventoryService.getExpenses({
      cityId: scopedCityId,
      countryId: scopedCountryId,
      page,
      limit,
    });
  }

  @Get(':entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  getBalance(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.inventoryService.getBalance(entityType, entityId);
  }

  @Post('adjust')
  @Roles(Role.ADMIN, Role.OFFICE)
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
  @Roles(Role.ADMIN, Role.OFFICE, Role.CITY, Role.COUNTRY)
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
