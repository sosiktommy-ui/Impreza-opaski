import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationGateway } from './notifications.gateway';
import { NotificationType } from '@prisma/client';

import { Prisma } from '@prisma/client';

export interface NotificationJobData {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { userIds, type, title, message, metadata } = job.data;

    this.logger.debug(
      `Processing notification job ${job.id}: ${title} for ${userIds.length} users`,
    );

    const results = await Promise.allSettled(
      userIds.map(async (userId) => {
        // Persist notification
        const notification = await this.notificationsService.create({
          userId,
          type,
          title,
          message,
          metadata,
        });

        // Push via WebSocket
        this.notificationGateway.sendToUser(userId, {
          id: notification.id,
          type,
          title,
          message,
          metadata,
          createdAt: notification.createdAt,
        });
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length}/${userIds.length} notifications failed for job ${job.id}`,
      );
    }
  }
}
