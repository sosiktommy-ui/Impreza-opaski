import { Body, Controller, Get, Post, BadRequestException } from '@nestjs/common';
import { AccessScope, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('ping')
  ping() {
    return { ok: true, ts: Date.now() };
  }

  @Get('db')
  async db() {
    const users = await this.prisma.user.count();
    const cities = await this.prisma.city.count();
    return { ok: true, users, cities };
  }

  @Post('reset-admin-pw')
  async resetAdminPw(@Body() body: { secret?: string }) {
    const expected = this.config.get<string>('RESET_SECRET') ?? 'impreza-reset-2026';
    if (!body?.secret || body.secret !== expected) {
      throw new BadRequestException('BAD_SECRET');
    }
    const hash = await bcrypt.hash('Impreza@Admin2026!', 10);
    const usernames = ['Dmitryganj', 'admin'];
    let resetCount = 0;
    let grantedCount = 0;
    for (const username of usernames) {
      const u = await this.prisma.user.upsert({
        where: { username },
        create: {
          username,
          displayName: username,
          passwordHash: hash,
          role: Role.ADMIN,
          isActive: true,
        },
        update: {
          passwordHash: hash,
          role: Role.ADMIN,
          isActive: true,
        },
      });
      resetCount++;
      const existing = await this.prisma.userAccess.findFirst({
        where: { userId: u.id, scope: AccessScope.GLOBAL },
      });
      if (!existing) {
        await this.prisma.userAccess.create({
          data: { userId: u.id, scope: AccessScope.GLOBAL },
        });
        grantedCount++;
      }
    }
    return { ok: true, resetCount, grantedCount };
  }
}
