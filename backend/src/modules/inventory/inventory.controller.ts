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
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTypeGuard } from '../auth/guards/access-type.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowAccessTypes } from '../auth/decorators/allow-access-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { AccessType, Role } from '@prisma/client';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  cityId!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string; // creator — balance deducted from this person

  @IsString()
  @IsNotEmpty()
  eventName!: string;

  @IsString()
  @IsOptional()
  eventDate?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  type?: string;

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
  @IsString()
  @IsNotEmpty()
  recipientUserId!: string; // USER whose balance receives the bracelets

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
  password?: string;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard, AccessTypeGuard)
export class InventoryController {
  private readonly logger = new Logger('InventoryController');

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly authService: AuthService,
  ) {}

  @Get('map')
  getMapData(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getMapData({
      role: user.role,
      officeId: user.officeId,
      primaryCityId: (user as any).primaryCityId ?? null,
    });
  }

  @Get('my')
  async getMyBalance(@CurrentUser() user: AuthenticatedUser) {
    if (user.role === Role.USER) {
      const primaryCityId = (user as any).primaryCityId;
      if (primaryCityId) return this.inventoryService.getBalance(primaryCityId);
      return { black: 0, white: 0, red: 0, blue: 0, total: 0 };
    }
    // ADMIN/OFFICE: no personal balance — return empty
    return { black: 0, white: 0, red: 0, blue: 0, total: 0 };
  }

  @Get('city/:cityId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  getByCity(@Param('cityId') cityId: string) {
    return this.inventoryService.getBalance(cityId);
  }

  @Get('country/:countryId')
  @Roles(Role.ADMIN, Role.OFFICE)
  getByCountry(@Param('countryId') countryId: string) {
    return this.inventoryService.getBalancesByCountry(countryId);
  }

  // ──────────────────────────────────────────────
  // EXPENSES
  // ──────────────────────────────────────────────

  @Get('expenses')
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  getExpenses(
    @Query('cityId') cityId?: string,
    @Query('countryId') countryId?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    let scopedCityId = cityId;
    let scopedUserId = userId;

    // USER sees only their own primary city expenses
    if (user?.role === Role.USER) {
      scopedUserId = user.id;
      scopedCityId = undefined;
    }

    return this.inventoryService.getExpenses({
      cityId: scopedCityId,
      countryId,
      userId: scopedUserId,
      type,
      page,
      limit,
    });
  }

  @Post('expense')
  @AllowAccessTypes(AccessType.FULL, AccessType.PARTIAL)
  @Roles(Role.ADMIN, Role.OFFICE)
  async createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!dto.cityId) throw new BadRequestException('cityId is required');
    if (!dto.userId) throw new BadRequestException('userId is required');

    return this.inventoryService.createExpense({
      cityId: dto.cityId,
      userId: dto.userId,
      eventName: dto.eventName,
      eventDate: dto.eventDate,
      location: dto.location,
      type: dto.type,
      black: dto.black,
      white: dto.white,
      red: dto.red,
      blue: dto.blue,
      notes: dto.notes,
      actorId: user.id,
    });
  }

  @Delete('expense/:id')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteExpense(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.deleteExpense(id, user.id);
  }

  // ──────────────────────────────────────────────
  // WAREHOUSE
  // ──────────────────────────────────────────────

  @Get('warehouse/creation-history')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE)
  async getWarehouseHistory(
    @Query('recipientUserId') recipientUserId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      return await this.inventoryService.getWarehouseCreationHistory({ recipientUserId, page, limit });
    } catch (error: any) {
      this.logger.error(`getWarehouseHistory error: ${error?.message}`, error?.stack);
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  @Post('warehouse/create-bracelets')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE)
  async createBracelets(
    @Body() dto: CreateBraceletsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Optional 2FA password check
    if (dto.password) {
      const isValid = await this.authService.verifyPassword(user.id, dto.password);
      if (!isValid) throw new BadRequestException('Неверный пароль');
    }

    return this.inventoryService.createBracelets({
      recipientUserId: dto.recipientUserId,
      black: dto.black,
      white: dto.white,
      red: dto.red,
      blue: dto.blue,
      notes: dto.notes,
      actorId: user.id,
    });
  }

  // ──────────────────────────────────────────────
  // COMPANY LOSSES
  // ──────────────────────────────────────────────

  @Get('company-losses/summary')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getCompanyLossesSummary(
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
  ) {
    try {
      return await this.inventoryService.getCompanyLossesSummary({ countryId, cityId });
    } catch (error: any) {
      this.logger.error(`getCompanyLossesSummary error: ${error?.message}`, error?.stack);
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
    @Query('search') search?: string,
  ) {
    try {
      return await this.inventoryService.getCompanyLosses({ page, limit, startDate, endDate, search });
    } catch (error: any) {
      this.logger.error(`getCompanyLosses error: ${error?.message}`, error?.stack);
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }
  }

  // ──────────────────────────────────────────────
  // SYSTEM MINUS & LOSSES
  // ──────────────────────────────────────────────

  @Get('system-minus/summary')
  @Roles(Role.ADMIN, Role.OFFICE)
  async getSystemMinusSummary() {
    try {
      return await this.inventoryService.getSystemMinusSummary();
    } catch (error: any) {
      this.logger.error(`getSystemMinusSummary error: ${error?.message}`, error?.stack);
      return { black: 0, white: 0, red: 0, blue: 0, total: 0, totalCreated: 0, totalBalances: 0 };
    }
  }

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
}

