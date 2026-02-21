import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
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
}
