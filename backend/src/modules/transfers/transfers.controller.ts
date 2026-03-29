import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { Role, TransferStatus, EntityType, ItemType } from '@prisma/client';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import {
  IsEnum,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class TransferItemDto {
  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsInt()
  @Min(1)
  quantity!: number;
}

class CreateTransferDto {
  @IsEnum(EntityType)
  senderType!: EntityType;

  @IsString()
  @IsOptional()
  senderOfficeId?: string;

  @IsString()
  @IsOptional()
  senderCountryId?: string;

  @IsString()
  @IsOptional()
  senderCityId?: string;

  @IsEnum(EntityType)
  receiverType!: EntityType;

  @IsString()
  @IsOptional()
  receiverOfficeId?: string;

  @IsString()
  @IsOptional()
  receiverCountryId?: string;

  @IsString()
  @IsOptional()
  receiverCityId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items!: TransferItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

class RejectTransferDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

class AcceptanceItemDto {
  @IsEnum(ItemType)
  itemType!: ItemType;

  @IsInt()
  @Min(0)
  receivedQuantity!: number;
}

class AcceptTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceItemDto)
  items!: AcceptanceItemDto[];
}

@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  sendTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.sendTransfer({
      ...dto,
      createdBy: user.id,
    });
  }

  @Patch(':id/accept')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  acceptTransfer(
    @Param('id') id: string,
    @Body() dto: AcceptTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.acceptTransfer(id, dto.items, user.id);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  rejectTransfer(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.rejectTransfer(id, dto.reason, user.id);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY)
  cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.cancelTransfer(id, user.id);
  }

  @Patch(':id/resolve-discrepancy')
  @Roles(Role.ADMIN)
  async resolveDiscrepancy(
    @Param('id') id: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Verify password for 2FA
    const isValid = await this.authService.verifyPassword(user.id, dto.password);
    if (!isValid) {
      throw new BadRequestException('Неверный пароль');
    }
    return this.transfersService.resolveDiscrepancy(id, dto, user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  findAll(
    @Query('status') status: TransferStatus | undefined,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('direction') direction?: 'sent' | 'received',
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.transfersService.findAll({
      status,
      page,
      limit,
      direction,
      countryId,
      cityId,
      userRole: user?.role,
      userId: user?.id,
      userCountryId: user?.countryId ?? undefined,
      userCityId: user?.cityId ?? undefined,
      userOfficeId: (user as any)?.officeId ?? undefined,
    });
  }

  // Static routes MUST come before parameterised :id route
  @Get('pending')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  getPendingIncoming(@CurrentUser() user: AuthenticatedUser) {
    let entityType: EntityType;
    let entityId: string;

    if (user.role === Role.ADMIN) {
      entityType = EntityType.ADMIN;
      entityId = user.id;
    } else if (user.role === Role.OFFICE) {
      entityType = EntityType.OFFICE;
      entityId = (user as any).officeId || user.id;
    } else if (user.role === Role.CITY && user.cityId) {
      entityType = EntityType.CITY;
      entityId = user.cityId;
    } else if (user.countryId) {
      entityType = EntityType.COUNTRY;
      entityId = user.countryId;
    } else {
      return [];
    }

    return this.transfersService.getPendingIncoming({
      entityType,
      entityId,
      userRole: user.role,
    });
  }

  @Get('problematic')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  findProblematic(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.transfersService.findProblematic({
      page,
      limit,
      countryId,
      cityId,
      userRole: user?.role,
      userCountryId: user?.countryId ?? undefined,
      userCityId: user?.cityId ?? undefined,
      userOfficeId: (user as any)?.officeId ?? undefined,
    });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  getStats(
    @Query('period') period: 'week' | 'month' | 'quarter' | 'year' = 'month',
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.transfersService.getStats({
      period,
      countryId,
      cityId,
      userRole: user?.role,
      userCountryId: user?.countryId ?? undefined,
      userCityId: user?.cityId ?? undefined,
      userOfficeId: (user as any)?.officeId ?? undefined,
    });
  }

  // Parameterised route MUST be last
  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICE, Role.COUNTRY, Role.CITY)
  findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.findById(id, user);
  }
}
