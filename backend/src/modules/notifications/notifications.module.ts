import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationProcessor } from './notifications.processor';
import { NotificationGateway } from './notifications.gateway';
import { NotificationListener } from './notifications.listener';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationProcessor,
    NotificationGateway,
    NotificationListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
