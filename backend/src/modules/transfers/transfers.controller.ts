import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import {
  AcceptTransferDto,
  CreateTransferDto,
  TransferListQueryDto,
} from './dto/transfers.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly svc: TransfersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: TransferListQueryDto) {
    return this.svc.list(user, q);
  }

  @Get(':id')
  byId(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.byId(user, id);
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthUser) {
    return this.svc.create(dto, user);
  }

  @Post(':id/accept')
  accept(
    @Param('id') id: string,
    @Body() dto: AcceptTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.accept(id, dto, user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reject(id, user);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.resolve(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.cancel(id, user);
  }
}
