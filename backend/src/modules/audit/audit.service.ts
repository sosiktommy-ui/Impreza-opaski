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

  @OnEvent('discrepancy.resolved')
  async onDiscrepancyResolved(payload: {
    transferId: string;
    actorId: string;
    resolutionType: string;
    totalLoss: number;
    sentByColor: Record<string, number>;
    receivedByColor: Record<string, number>;
    notes?: string;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.DISCREPANCY_RESOLVED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: {
        event: 'discrepancy.resolved',
        resolutionType: payload.resolutionType,
        totalLoss: payload.totalLoss,
        sentByColor: payload.sentByColor,
        receivedByColor: payload.receivedByColor,
        notes: payload.notes,
      },
    });
  }

  @OnEvent('transfer.edited')
  async onTransferEdited(payload: {
    transferId: string;
    actorId: string;
    oldItems: any;
    notes?: string;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.TRANSFER_EDITED,
      entityType: 'Transfer',
      entityId: payload.transferId,
      metadata: {
        event: 'transfer.edited',
        ...payload.oldItems,
        notes: payload.notes,
      },
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

  // ----- Phase 2: scope/access events ---------------------------------------

  @OnEvent('auth.scope_selected')
  async onScopeSelected(payload: {
    actorId: string;
    accessId: string;
    scopeType: string;
    scopeId: string | null;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.SCOPE_SELECTED,
      entityType: 'UserAccess',
      entityId: payload.accessId,
      metadata: {
        event: 'auth.scope_selected',
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
      },
    });
  }

  @OnEvent('auth.scope_switched')
  async onScopeSwitched(payload: {
    actorId: string;
    previousAccessId: string | null;
    accessId: string;
    scopeType: string;
    scopeId: string | null;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.SCOPE_SWITCHED,
      entityType: 'UserAccess',
      entityId: payload.accessId,
      metadata: {
        event: 'auth.scope_switched',
        previousAccessId: payload.previousAccessId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
      },
    });
  }

  @OnEvent('access.granted')
  async onAccessGranted(payload: {
    actorId: string;
    accessId: string;
    userId: string;
    scopeType: string;
    scopeId: string | null;
    expiresAt?: Date | null;
    notes?: string | null;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.ACCESS_GRANTED,
      entityType: 'UserAccess',
      entityId: payload.accessId,
      metadata: {
        event: 'access.granted',
        userId: payload.userId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        expiresAt: payload.expiresAt ? payload.expiresAt.toISOString() : null,
        notes: payload.notes ?? null,
      },
    });
  }

  @OnEvent('access.revoked')
  async onAccessRevoked(payload: {
    actorId: string;
    accessId: string;
    userId: string;
    scopeType: string;
    scopeId: string | null;
  }) {
    if (!payload.actorId) return;
    await this.log({
      actorId: payload.actorId,
      action: AuditAction.ACCESS_REVOKED,
      entityType: 'UserAccess',
      entityId: payload.accessId,
      metadata: {
        event: 'access.revoked',
        userId: payload.userId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
      },
    });
  }
}
