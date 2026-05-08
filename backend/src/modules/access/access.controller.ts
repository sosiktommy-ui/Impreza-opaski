import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTypeGuard } from '../auth/guards/access-type.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowAccessTypes } from '../auth/decorators/allow-access-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { AccessService } from './access.service';
import { GrantAccessDto } from './dto/grant-access.dto';
import { UpdateAccessDto } from './dto/update-access.dto';

/** Manages UserAccess rows. */
@Controller('access')
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  /** Any authenticated user can fetch their own accesses. */
  @Get('my')
  getMyAccesses(@CurrentUser() user: AuthenticatedUser) {
    return this.accessService.listForUser(user.id);
  }

  @Get('users/:userId')
  @UseGuards(RolesGuard, AccessTypeGuard)
  @AllowAccessTypes(AccessType.FULL)
  @Roles(Role.ADMIN)
  listForUser(@Param('userId') userId: string) {
    return this.accessService.listForUser(userId);
  }

  @Post()
  grant(
    @Body() dto: GrantAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessService.grant(dto, user.id);
  }

  @Patch(':id/revoke')
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accessService.revoke(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccessDto,
  ) {
    return this.accessService.update(id, dto);
  }
}
