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
  ForbiddenException,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTypeGuard } from '../auth/guards/access-type.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowAccessTypes } from '../auth/decorators/allow-access-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { AccessType, Role, TransferStatus, ItemType } from '@prisma/client';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { EditTransferDto } from './dto/edit-transfer.dto';
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
  @IsString()
  @IsNotEmpty()
  fromUserId!: string;

  @IsString()
  @IsNotEmpty()
  toUserId!: string;

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
@UseGuards(JwtAuthGuard, RolesGuard, AccessTypeGuard)
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  sendTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // USER can only send from themselves
    if (user.role === Role.USER && dto.fromUserId !== user.id) {
      throw new ForbiddenException('Пользователь может отправить перевод только от себя');
    }
    return this.transfersService.sendTransfer({
      fromUserId: dto.fromUserId,
      toUserId: dto.toUserId,
      items: dto.items,
      notes: dto.notes,
      createdBy: user.id,
    });
  }

  @Patch(':id/accept')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  acceptTransfer(
    @Param('id') id: string,
    @Body() dto: AcceptTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.acceptTransfer(id, dto.items, user.id);
  }

  @Patch(':id/reject')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  rejectTransfer(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.rejectTransfer(id, dto.reason, user.id);
  }

  @Patch(':id/cancel')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  async cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // USER can only cancel their own outgoing transfers
    if (user.role === Role.USER) {
      const transfer = await this.transfersService.findById(id);
      if (transfer.fromUserId !== user.id) {
        throw new ForbiddenException('Вы можете отменить только свои отправки');
      }
    }
    return this.transfersService.cancelTransfer(id, user.id);
  }

  @Patch(':id/resolve-discrepancy')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN)
  async resolveDiscrepancy(
    @Param('id') id: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isValid = await this.authService.verifyPassword(user.id, dto.password);
    if (!isValid) {
      throw new BadRequestException('Неверный пароль');
    }
    return this.transfersService.resolveDiscrepancy(id, dto, user.id);
  }

  @Patch(':id/edit')
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN)
  async editTransfer(
    @Param('id') id: string,
    @Body() dto: EditTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isValid = await this.authService.verifyPassword(user.id, dto.password);
    if (!isValid) {
      throw new BadRequestException('Неверный пароль');
    }
    return this.transfersService.editTransfer(id, dto.items, user.id, dto.notes);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
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
      userPrimaryCityId: (user as any)?.primaryCityId ?? undefined,
    });
  }

  // Static routes MUST come before parameterised :id route
  @Get('pending')
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  getPendingIncoming(@CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.getPendingIncoming({
      userId: user.id,
      userRole: user.role,
    });
  }

  @Get('problematic')
  @Roles(Role.ADMIN, Role.OFFICE)
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
      userPrimaryCityId: (user as any)?.primaryCityId ?? undefined,
    });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.OFFICE)
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
      userPrimaryCityId: (user as any)?.primaryCityId ?? undefined,
    });
  }

  // Parameterised route MUST be last
  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICE, Role.USER)
  findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transfersService.findById(id, user);
  }
}

