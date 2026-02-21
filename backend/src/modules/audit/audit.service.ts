import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const entry = await this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    this.logger.debug(
      `Audit: ${params.action} on ${params.entityType}/${params.entityId} by ${params.actorId}`,
    );

    return entry;
  }

  async findAll(params: {
    actorId?: string;
    action?: AuditAction;
    entityType?: string;
    entityId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.actorId) where.actorId = params.actorId;
    if (params.action) where.action = params.action;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) (where.createdAt as Record<string, unknown>).gte = params.dateFrom;
      if (params.dateTo) (where.createdAt as Record<string, unknown>).lte = params.dateTo;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, username: true, displayName: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: {
        actor: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // Event listeners for automatic audit logging
  @OnEvent('transfer.sent')
  async onTransferSent(payload: { transferId: string; actorId: string }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.TRANSFER_SENT,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: { event: 'transfer.sent', status: 'SENT' },
    });
  }

  @OnEvent('transfer.accepted')
  async onTransferAccepted(payload: { transferId: string; actorId: string }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.TRANSFER_ACCEPTED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: { event: 'transfer.accepted' },
    });
  }

  @OnEvent('transfer.discrepancy')
  async onTransferDiscrepancy(payload: {
    transferId: string;
    actorId: string;
    records: Array<{ itemType: string; sentQuantity: number; receivedQuantity: number; discrepancy: number }>;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.DISCREPANCY_DETECTED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: {
        event: 'transfer.discrepancy',
        records: payload.records,
      },
    });
  }

  @OnEvent('transfer.rejected')
  async onTransferRejected(payload: { transferId: string; actorId: string; reason: string }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.TRANSFER_REJECTED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: { event: 'transfer.rejected', reason: payload.reason },
    });
  }

  @OnEvent('transfer.cancelled')
  async onTransferCancelled(payload: { transferId: string; actorId: string }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.TRANSFER_CANCELLED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: { event: 'transfer.cancelled' },
    });
  }

  @OnEvent('inventory.adjusted')
  async onInventoryAdjusted(payload: {
    actorId: string;
    entityType: string;
    entityId: string;
    itemType: string;
    previousQuantity: number;
    newQuantity: number;
    reason: string;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.INVENTORY_ADJUSTED,
      entityType: 'Inventory',
      entityId: payload.entityId,
      metadata: {
        event: 'inventory.adjusted',
        itemType: payload.itemType,
        previousQuantity: payload.previousQuantity,
        newQuantity: payload.newQuantity,
        reason: payload.reason,
      },
    });
  }
}
