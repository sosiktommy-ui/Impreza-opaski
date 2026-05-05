import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  getConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getConversations(user.id);
  }

  @Get('users')
  getUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getUsers(user);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getUnreadCount(user.id);
  }

  @Get('messages/:userId')
  getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') otherUserId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: string,
  ) {
    return this.chatService.getMessages(
      user.id,
      otherUserId,
      limit || 50,
      before,
    );
  }

  @Post('messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: { receiverId: string; text: string },
  ) {
    return this.chatService.sendMessage(user, data.receiverId, data.text);
  }

  @Patch('messages/:senderId/read')
  markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('senderId') senderId: string,
  ) {
    return this.chatService.markAsRead(user.id, senderId);
  }
}
