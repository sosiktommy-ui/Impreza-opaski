import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getConversations(userId: string) {
    // Get latest message per conversation partner
    const sent = await this.prisma.chatMessage.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: {
          select: { id: true, displayName: true, avatarUrl: true, role: true },
        },
      },
    });

    const received = await this.prisma.chatMessage.findMany({
      where: { receiverId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true, role: true },
        },
      },
    });

    // Build conversations map
    const conversations = new Map<
      string,
      {
        user: {
          id: string;
          displayName: string;
          avatarUrl: string | null;
          role: string;
        };
        lastMessage: { text: string; createdAt: Date; senderId: string };
        unreadCount: number;
      }
    >();

    // Process all messages to find latest per conversation
    const allMessages = [
      ...sent.map((m) => ({
        ...m,
        otherUser: m.receiver,
        otherId: m.receiverId,
      })),
      ...received.map((m) => ({
        ...m,
        otherUser: m.sender,
        otherId: m.senderId,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    for (const msg of allMessages) {
      if (!conversations.has(msg.otherId)) {
        conversations.set(msg.otherId, {
          user: msg.otherUser,
          lastMessage: {
            text: msg.text,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
          },
          unreadCount: 0, // will be filled below
        });
      }
    }

    // Count unread per sender
    const unreadCounts = await this.prisma.chatMessage.groupBy({
      by: ['senderId'],
      where: { receiverId: userId, read: false },
      _count: true,
    });

    for (const uc of unreadCounts) {
      const conv = conversations.get(uc.senderId);
      if (conv) conv.unreadCount = uc._count;
    }

    return Array.from(conversations.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime(),
    );
  }

  async getMessages(
    userId: string,
    otherUserId: string,
    limit = 50,
    before?: string,
  ) {
    const where: any = {
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    };

    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Mark received messages as read
    await this.prisma.chatMessage.updateMany({
      where: { senderId: otherUserId, receiverId: userId, read: false },
      data: { read: true },
    });

    return messages.reverse();
  }

  async sendMessage(senderId: string, receiverId: string, text: string) {
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver) throw new NotFoundException('Получатель не найден');

    return this.prisma.chatMessage.create({
      data: { senderId, receiverId, text },
      include: {
        sender: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async markAsRead(userId: string, senderId: string) {
    return this.prisma.chatMessage.updateMany({
      where: { senderId, receiverId: userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.chatMessage.count({
      where: { receiverId: userId, read: false },
    });
  }

  async getUsers(currentUserId: string) {
    return this.prisma.user.findMany({
      where: { id: { not: currentUserId }, isActive: true },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        username: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }
}
