import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ExpenseListQueryDto } from './dto/expenses.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ExpenseListQueryDto) {
    return this.svc.list(user, q);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.svc.create(dto, user);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.remove(id, user);
  }
}
