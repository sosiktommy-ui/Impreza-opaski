import { Controller, Get, Post, Body } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import * as bcrypt from 'bcrypt';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    // Simple ping — returns 200 immediately so Railway healthcheck passes
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('detailed')
  async detailed() {
    const checks: Record<string, { status: string; latency?: number }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'down', latency: Date.now() - dbStart };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      await this.redis.set('health:ping', 'pong', 5);
      const val = await this.redis.get('health:ping');
      checks.redis = {
        status: val === 'pong' ? 'up' : 'degraded',
        latency: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: 'down', latency: Date.now() - redisStart };
    }

    const overall = Object.values(checks).every((c) => c.status === 'up')
      ? 'healthy'
      : 'unhealthy';

    return {
      status: overall,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return { status: 'not ready' };
    }
  }

  // TEMPORARY: Reset admin password — remove after use
  @Post('reset-admin-pw')
  async resetAdminPassword(@Body() body: { secret: string }) {
    if (body?.secret !== 'impreza-reset-2026') {
      return { error: 'forbidden' };
    }
    const newPassword = 'Impreza@Admin2026!';
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' } });
    if (admins.length === 0) {
      return { error: 'no admins found', allUsers: await this.prisma.user.findMany({ select: { username: true, role: true, email: true } }) };
    }
    await this.prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { passwordHash } });
    return {
      success: true,
      resetCount: admins.length,
      admins: admins.map(a => ({ username: a.username, email: a.email })),
      newPassword,
    };
  }
}
