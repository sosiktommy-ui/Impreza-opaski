import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationJobData } from './notifications.processor';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent('transfer.sent')
  async handleTransferSent(payload: {
    transferId: string;
    fromEntityId: string;
    fromEntityType: string;
    fromEntityName: string;
    toEntityId: string;
    toEntityType: string;
    toEntityName: string;
    items: Array<{ type: string; quantity: number }>;
    actorId: string;
    createdByName: string;
  }) {
    this.logger.debug(`Event transfer.sent: ${payload.transferId}`);

    const userIds = await this.notificationsService.findUsersForEntity(
      payload.toEntityType,
      payload.toEntityId,
    );

    const itemsSummary = payload.items
      .map((i) => `${i.quantity}x ${i.type}`)
      .join(', ');

    await this.enqueue({
      userIds,
      type: NotificationType.INCOMING_TRANSFER,
      title: 'Входящий трансфер',
      message: `Трансфер от ${payload.fromEntityName} (${payload.createdByName}): ${itemsSummary}`,
      metadata: { transferId: payload.transferId },
    });
  }

  @OnEvent('transfer.accepted')
  async handleTransferAccepted(payload: {
    transferId: string;
    fromEntityId: string;
    fromEntityType: string;
    fromEntityName: string;
    toEntityName: string;
    acceptedByName: string;
    actorId: string;
  }) {
    this.logger.debug(`Event transfer.accepted: ${payload.transferId}`);

    const userIds = await this.notificationsService.findUsersForEntity(
      payload.fromEntityType,
      payload.fromEntityId,
    );

    await this.enqueue({
      userIds,
      type: NotificationType.TRANSFER_ACCEPTED,
      title: 'Трансфер принят',
      message: `Трансфер к ${payload.toEntityName} принят (${payload.acceptedByName})`,
      metadata: { transferId: payload.transferId },
    });
  }

  @OnEvent('transfer.discrepancy')
  async handleTransferDiscrepancy(payload: {
    transferId: string;
    fromEntityId: string;
    fromEntityType: string;
    fromEntityName: string;
    toEntityName: string;
    acceptedByName: string;
    actorId: string;
    records: Array<{ itemType: string; sentQuantity: number; receivedQuantity: number; discrepancy: number }>;
  }) {
    this.logger.debug(`Event transfer.discrepancy: ${payload.transferId}`);

    const userIds = await this.notificationsService.findUsersForEntity(
      payload.fromEntityType,
      payload.fromEntityId,
    );

    const discrepancies = payload.records
      .filter((r) => r.discrepancy !== 0)
      .map((r) => `${r.itemType}: отпр. ${r.sentQuantity}, получ. ${r.receivedQuantity} (разн. ${r.discrepancy})`)
      .join('; ');

    await this.enqueue({
      userIds,
      type: NotificationType.DISCREPANCY_ALERT,
      title: 'Расхождение при приёмке',
      message: `Расхождение в трансфере от ${payload.fromEntityName} (${payload.acceptedByName}): ${discrepancies}`,
      metadata: { transferId: payload.transferId, records: payload.records },
    });
  }

  @OnEvent('transfer.rejected')
  async handleTransferRejected(payload: {
    transferId: string;
    fromEntityId: string;
    fromEntityType: string;
    fromEntityName: string;
    rejectedByName: string;
    reason: string;
    actorId: string;
  }) {
    this.logger.debug(`Event transfer.rejected: ${payload.transferId}`);

    const userIds = await this.notificationsService.findUsersForEntity(
      payload.fromEntityType,
      payload.fromEntityId,
    );

    await this.enqueue({
      userIds,
      type: NotificationType.TRANSFER_REJECTED,
      title: 'Трансфер отклонён',
      message: `Трансфер отклонён (${payload.rejectedByName}): ${payload.reason}`,
      metadata: { transferId: payload.transferId },
    });
  }

  @OnEvent('city.lowStock')
  async handleLowStock(payload: {
    cityId: string;
    cityName: string;
    countryName: string;
    totalBalance: number;
  }) {
    this.logger.debug(`Event city.lowStock: ${payload.cityName}`);

    const userIds = await this.notificationsService.findUsersForEntity('CITY', payload.cityId);

    await this.enqueue({
      userIds,
      type: NotificationType.LOW_STOCK,
      title: 'Low Stock Alert',
      message: `${payload.cityName} (${payload.countryName}) stock is low: ${payload.totalBalance} items remaining`,
      metadata: { cityId: payload.cityId, totalBalance: payload.totalBalance },
    });
  }

  @OnEvent('city.zeroStock')
  async handleZeroStock(payload: {
    cityId: string;
    cityName: string;
    countryName: string;
  }) {
    this.logger.debug(`Event city.zeroStock: ${payload.cityName}`);

    const userIds = await this.notificationsService.findUsersForEntity('CITY', payload.cityId);

    await this.enqueue({
      userIds,
      type: NotificationType.ZERO_STOCK,
      title: 'Zero Stock — City Inactive',
      message: `${payload.cityName} (${payload.countryName}) has reached zero stock and is now INACTIVE`,
      metadata: { cityId: payload.cityId },
    });
  }

  private async enqueue(data: NotificationJobData) {
    await this.notificationQueue.add('send-notification', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
