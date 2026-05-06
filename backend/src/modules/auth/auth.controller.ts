import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyPasswordDto } from './dto/verify-password.dto';
import { SelectScopeDto } from './dto/select-scope.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PersonalAuthGuard } from './guards/personal-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.login(
      loginDto.username,
      loginDto.password,
    );

    // Set refresh token as HttpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    return {
      user,
      accessToken: tokens.accessToken,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokens = await this.authService.refresh(refreshToken);

    // Set new refresh token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      accessToken: tokens.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refresh_token;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    response.clearCookie('refresh_token', { path: '/' });

    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logoutAll(user.id);
    response.clearCookie('refresh_token', { path: '/' });
    return { message: 'All sessions revoked' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const payload = (request as any).jwtPayload;
    const access = payload ? await this.authService.resolveAccessTarget(payload) : null;
    return { user, access };
  }

  @Post('verify-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPasswordDto,
  ) {
    const isValid = await this.authService.verifyPassword(user.id, dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }
    return { verified: true };
  }

  // ---------------------------------------------------------------------------
  // Two-step login (Phase 2). Frontend can adopt at its own pace; legacy /login
  // continues to work and auto-picks a default access.
  // ---------------------------------------------------------------------------

  /**
   * Step 1 of two-step login. Returns a short-lived personal token that can
   * only be exchanged for a scoped token via /auth/select-scope.
   */
  @Post('login-personal')
  @HttpCode(HttpStatus.OK)
  async loginPersonal(@Body() loginDto: LoginDto) {
    const { user, personalAccessToken } = await this.authService.loginPersonal(
      loginDto.username,
      loginDto.password,
    );
    return { user, personalAccessToken };
  }

  /**
   * Step 2 of two-step login. Requires a personal token. Returns a full scoped
   * access token + sets the refresh cookie.
   */
  @Post('select-scope')
  @UseGuards(PersonalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async selectScope(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectScopeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user: scopedUser, tokens, access } =
      await this.authService.selectScope(user.id, dto.accessId);

    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      user: scopedUser,
      accessToken: tokens.accessToken,
      access: {
        id: access.id,
        scopeType: access.scopeType,
        accessType: access.accessType,
        scopeId: access.scopeId,
      },
    };
  }

  /**
   * Switch to a different scope while already authenticated. Issues a new
   * scoped access token and rotates the refresh cookie.
   */
  @Post('switch-scope')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchScope(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectScopeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const previousAccessId =
      (request as any).jwtPayload?.accessId ?? null;
    const { user: scopedUser, tokens, access } =
      await this.authService.switchScope(user.id, dto.accessId, previousAccessId);

    const isProduction = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      user: scopedUser,
      accessToken: tokens.accessToken,
      access: {
        id: access.id,
        scopeType: access.scopeType,
        accessType: access.accessType,
        scopeId: access.scopeId,
      },
    };
  }

  /**
   * List the caller's own active accesses, used to render the scope picker.
   * Personal token is enough — caller may not yet hold a scoped token.
   */
  @Get('my-accesses')
  @UseGuards(PersonalAuthGuard)
  async myAccesses(@CurrentUser() user: AuthenticatedUser) {
    const accesses = await this.authService.listMyAccesses(user.id);
    return { accesses };
  }

  /**
   * Same payload as /my-accesses but for callers that already hold a scoped
   * token (e.g. the header dropdown when switching scopes).
   */
  @Get('accesses')
  @UseGuards(JwtAuthGuard)
  async myAccessesScoped(@CurrentUser() user: AuthenticatedUser) {
    const accesses = await this.authService.listMyAccesses(user.id);
    return { accesses };
  }
}
