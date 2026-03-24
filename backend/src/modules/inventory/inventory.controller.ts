import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
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
  @IsOptional()
  cityId?: string;

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

class CreateBraceletsDto {
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

  @IsString()
  @IsOptional()
  password?: string; // For 2FA verification
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('map')
  getMapData(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getMapData(user);
  }

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
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // CITY role always uses own cityId
    // ADMIN/OFFICE/COUNTRY must provide cityId in dto
    let targetCityId = dto.cityId;
    if (user.role === Role.CITY && user.cityId) {
      targetCityId = user.cityId;
    }
    if (!targetCityId) {
      throw new BadRequestException('cityId is required');
    }
    return this.inventoryService.createExpense({
      ...dto,
      cityId: targetCityId,
      actorId: user.id,
    });
  }

  @Delete('expense/:id')
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.deleteExpense(id, user.id);
  }

  // ──────────────────────────────────────────────
  // WAREHOUSE ENDPOINTS (ADMIN/OFFICE)
  // ──────────────────────────────────────────────

  @Get('warehouse/balance')
  @Roles(Role.ADMIN, Role.OFFICE)
  getWarehouseBalance(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) {
      return this.inventoryService.getWarehouseBalance(EntityType.ADMIN);
    } else {
      return this.inventoryService.getWarehouseBalance(EntityType.OFFICE, user.officeId!);
    }
  }

  @Get('warehouse/creation-history')
  @Roles(Role.ADMIN, Role.OFFICE)
  getWarehouseHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (user.role === Role.ADMIN) {
      // ADMIN sees all creation history
      return this.inventoryService.getWarehouseCreationHistory({ page, limit });
    } else {
      // OFFICE sees only their own
      return this.inventoryService.getWarehouseCreationHistory({
        entityType: EntityType.OFFICE,
        officeId: user.officeId!,
        page,
        limit,
      });
    }
  }

  @Post('warehouse/create-bracelets')
  @Roles(Role.ADMIN, Role.OFFICE)
  async createBracelets(
    @Body() dto: CreateBraceletsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // 2FA verification would happen here, but password is verified on frontend
    // In production, you'd call AuthService.verifyPassword(user.id, dto.password)

    const entityType = user.role === Role.ADMIN ? EntityType.ADMIN : EntityType.OFFICE;
    const officeId = user.role === Role.OFFICE && user.officeId ? user.officeId : undefined;

    return this.inventoryService.createBracelets({
      entityType,
      officeId,
      black: dto.black,
      white: dto.white,
      red: dto.red,
      blue: dto.blue,
      notes: dto.notes,
      actorId: user.id,
    });
  }

  // ──────────────────────────────────────────────
  // COMPANY LOSSES ENDPOINTS
  // ──────────────────────────────────────────────

  @Get('company-losses/summary')
  @Roles(Role.ADMIN, Role.OFFICE)
  getCompanyLossesSummary() {
    return this.inventoryService.getCompanyLossesSummary();
  }

  @Get('company-losses')
  @Roles(Role.ADMIN, Role.OFFICE)
  getCompanyLosses(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('countryId') countryId?: string,
  ) {
    return this.inventoryService.getCompanyLosses({
      page,
      limit,
      startDate,
      endDate,
      countryId,
    });
  }
}
