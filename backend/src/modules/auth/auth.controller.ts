import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, SelectScopeDto } from './dto/auth.dto';
import { JwtAuthGuard, PersonalAuthGuard, AnyAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @UseGuards(AnyAuthGuard)
  @Get('my-accesses')
  myAccesses(@CurrentUser() user: AuthUser) {
    return this.auth.myAccesses(user.id);
  }

  @UseGuards(PersonalAuthGuard)
  @Post('select-scope')
  @HttpCode(200)
  selectScope(@CurrentUser() user: AuthUser, @Body() dto: SelectScopeDto) {
    return this.auth.selectScope(user, dto.accessId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-scope')
  @HttpCode(200)
  switchScope(@CurrentUser() user: AuthUser, @Body() dto: SelectScopeDto) {
    return this.auth.selectScope(user, dto.accessId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.oldPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
