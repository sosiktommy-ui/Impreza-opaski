import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata,
      },
    });

    this.logger.debug(`Notification created for user ${params.userId}: ${params.title}`);
    return notification;
  }

  async findByUser(userId: string, params: { unreadOnly?: boolean; page?: number; limit?: number }) {
    const { unreadOnly = false, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: { userId: string; read?: boolean } = { userId };
    if (unreadOnly) where.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, unreadCount },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // Find users who should be notified about a country/city event
  async findUsersForEntity(entityType: string, entityId: string): Promise<string[]> {
    const userIds: string[] = [];

    if (entityType === 'CITY') {
      // Notify city user + country user
      const cityUsers = await this.prisma.user.findMany({
        where: { cityId: entityId, isActive: true },
        select: { id: true },
      });
      userIds.push(...cityUsers.map((u) => u.id));

      // Get country for this city
      const city = await this.prisma.city.findUnique({
        where: { id: entityId },
        select: { countryId: true },
      });
      if (city) {
        const countryUsers = await this.prisma.user.findMany({
          where: {
            countryId: city.countryId,
            role: 'COUNTRY',
            isActive: true,
          },
          select: { id: true },
        });
        userIds.push(...countryUsers.map((u) => u.id));
      }
    } else if (entityType === 'COUNTRY') {
      const countryUsers = await this.prisma.user.findMany({
        where: {
          countryId: entityId,
          role: 'COUNTRY',
          isActive: true,
        },
        select: { id: true },
      });
      userIds.push(...countryUsers.map((u) => u.id));
    }

    // Always notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    userIds.push(...admins.map((u) => u.id));

    return [...new Set(userIds)]; // deduplicate
  }
}
