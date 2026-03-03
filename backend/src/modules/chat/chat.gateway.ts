import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*', credentials: true },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      client.data.userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);

      this.logger.debug(`Chat: User ${userId} connected (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    client: Socket,
    data: { receiverId: string; text: string },
  ) {
    const senderId = client.data?.userId;
    if (!senderId || !data.receiverId || !data.text?.trim()) return;

    try {
      const message = await this.chatService.sendMessage(
        senderId,
        data.receiverId,
        data.text.trim(),
      );
      this.server.to(`user:${senderId}`).emit('new_message', message);
      this.server.to(`user:${data.receiverId}`).emit('new_message', message);
    } catch (err: any) {
      client.emit('message_error', {
        error: err.message || 'Ошибка отправки',
      });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(client: Socket, data: { senderId: string }) {
    const userId = client.data?.userId;
    if (!userId || !data.senderId) return;
    await this.chatService.markAsRead(userId, data.senderId);
    this.server
      .to(`user:${data.senderId}`)
      .emit('messages_read', { readBy: userId });
  }
}
