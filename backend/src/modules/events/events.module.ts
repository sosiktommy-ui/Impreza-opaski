import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RedisModule } from '../../common/redis/redis.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [RedisModule, PrismaModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
