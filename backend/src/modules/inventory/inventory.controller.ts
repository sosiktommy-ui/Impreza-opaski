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
  Logger,
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
  officeId?: string; // For ADMIN to specify which office

  @IsString()
  @IsOptional()
  password?: string; // For 2FA verification
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  private readonly logger = new Logger('InventoryController');
  
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

  // NOTE: Parametric route moved to the end of controller to avoid matching before static routes

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
  async getWarehouseBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('officeId') queryOfficeId?: string,
  ) {
    this.logger.log(`getWarehouseBalance: user=${user.id}, role=${user.role}, queryOfficeId=${queryOfficeId}`);
    
    try {
      if (user.role === Role.ADMIN) {
        if (queryOfficeId) {
          this.logger.log(`ADMIN viewing OFFICE balance for ${queryOfficeId}`);
          return await this.inventoryService.getWarehouseBalance(EntityType.OFFICE, queryOfficeId);
        }
        this.logger.log(`ADMIN viewing ADMIN balance`);
        return await this.inventoryService.getWarehouseBalance(EntityType.ADMIN);
      } else {
        return await this.inventoryService.getWarehouseBalance(EntityType.OFFICE, user.officeId!);
      }
    } catch (error: any) {
      this.logger.error(`getWarehouseBalance error: ${error?.message}`, error?.stack);
      // Return empty balance instead of 500 to avoid CORS blocking
      return { black: 0, white: 0, red: 0, blue: 0 };
    }
  }

  @Get('warehouse/creation-history')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getWarehouseHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('officeId') queryOfficeId?: string,
  ) {
    this.logger.log(`getWarehouseHistory: user=${user.id}, role=${user.role}, queryOfficeId=${queryOfficeId}`);
    
    try {
      if (user.role === Role.ADMIN) {
        if (queryOfficeId) {
          return await this.inventoryService.getWarehouseCreationHistory({
            entityType: EntityType.OFFICE,
            officeId: queryOfficeId,
            page,
            limit,
          });
        }
        return await this.inventoryService.getWarehouseCreationHistory({
          entityType: EntityType.ADMIN,
          page,
          limit,
        });
      } else {
        return await this.inventoryService.getWarehouseCreationHistory({
          entityType: EntityType.OFFICE,
          officeId: user.officeId!,
          page,
          limit,
        });
      }
    } catch (error: any) {
      this.logger.error(`getWarehouseHistory error: ${error?.message}`, error?.stack);
      // Return empty history instead of 500 to avoid CORS blocking
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  @Post('warehouse/create-bracelets')
  @Roles(Role.ADMIN, Role.OFFICE)
  async createBracelets(
    @Body() dto: CreateBraceletsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`=== CREATE BRACELETS REQUEST ===`);
    this.logger.log(`User: ${user.id}, Role: ${user.role}, OfficeId: ${user.officeId}`);
    this.logger.log(`DTO: ${JSON.stringify(dto)}`);
    
    // Determine entity type and officeId
    const entityType = user.role === Role.ADMIN ? EntityType.ADMIN : EntityType.OFFICE;
    
    // ADMIN can specify officeId from request, OFFICE uses their own officeId
    let officeId: string | undefined;
    if (user.role === Role.ADMIN) {
      // If ADMIN specifies officeId, use OFFICE entity type instead of ADMIN
      officeId = dto.officeId || undefined;
    } else {
      officeId = user.officeId || undefined;
    }

    // If ADMIN specified an officeId, treat as OFFICE creation, else as ADMIN creation
    const finalEntityType = (user.role === Role.ADMIN && officeId) ? EntityType.OFFICE : entityType;
    
    this.logger.log(`Final: entityType=${finalEntityType}, officeId=${officeId}`);

    const result = await this.inventoryService.createBracelets({
      entityType: finalEntityType,
      officeId,
      black: dto.black,
      white: dto.white,
      red: dto.red,
      blue: dto.blue,
      notes: dto.notes,
      actorId: user.id,
    });
    
    this.logger.log(`Created: ${JSON.stringify(result)}`);
    return result;
  }

  // ──────────────────────────────────────────────
  // COMPANY LOSSES ENDPOINTS
  // ──────────────────────────────────────────────

  @Get('company-losses/summary')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getCompanyLossesSummary() {
    try {
      return await this.inventoryService.getCompanyLossesSummary();
    } catch (error: any) {
      this.logger.error(`getCompanyLossesSummary error: ${error?.message}`, error?.stack);
      // Return empty summary instead of 500 to avoid CORS blocking
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, count: 0 };
    }
  }

  @Get('company-losses')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getCompanyLosses(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('countryId') countryId?: string,
  ) {
    try {
      return await this.inventoryService.getCompanyLosses({
        page,
        limit,
        startDate,
        endDate,
        countryId,
      });
    } catch (error: any) {
      this.logger.error(`getCompanyLosses error: ${error?.message}`, error?.stack);
      // Return empty list instead of 500 to avoid CORS blocking
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  // ──────────────────────────────────────────────
  // SYSTEM LOSSES ENDPOINTS (Company + Account Shortages)
  // ──────────────────────────────────────────────

  @Get('system-losses/summary')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getSystemLossesSummary() {
    try {
      return await this.inventoryService.getSystemLossesSummary();
    } catch (error: any) {
      this.logger.error(`getSystemLossesSummary error: ${error?.message}`, error?.stack);
      return { total: 0, black: 0, white: 0, red: 0, blue: 0, companyCount: 0, shortageCount: 0 };
    }
  }

  @Get('system-losses')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getSystemLosses(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      return await this.inventoryService.getSystemLosses({ page, limit });
    } catch (error: any) {
      this.logger.error(`getSystemLosses error: ${error?.message}`, error?.stack);
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  @Get('account-losses/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getAccountLosses(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    try {
      return await this.inventoryService.getAccountLosses(entityType, entityId);
    } catch (error: any) {
      this.logger.error(`getAccountLosses error: ${error?.message}`, error?.stack);
      return { data: [], summary: { total: 0, black: 0, white: 0, red: 0, blue: 0 } };
    }
  }

  // ──────────────────────────────────────────────
  // PARAMETRIC ROUTE - MUST BE LAST!
  // ──────────────────────────────────────────────
  // This route catches :entityType/:entityId patterns.
  // It MUST be after all static routes like warehouse/balance, company-losses/summary
  // otherwise NestJS will match those requests to this parametric route.

  @Get(':entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  getBalance(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.inventoryService.getBalance(entityType, entityId);
  }
}
