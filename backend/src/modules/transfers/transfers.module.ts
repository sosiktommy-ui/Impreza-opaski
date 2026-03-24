import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';

// CQRS Command Handlers
import { CreateTransferHandler } from './commands/create-transfer.handler';
import { SendTransferHandler } from './commands/send-transfer.handler';
import { AcceptTransferHandler } from './commands/accept-transfer.handler';
import { RejectTransferHandler } from './commands/reject-transfer.handler';
import { CancelTransferHandler } from './commands/cancel-transfer.handler';

const CommandHandlers = [
  CreateTransferHandler,
  SendTransferHandler,
  AcceptTransferHandler,
  RejectTransferHandler,
  CancelTransferHandler,
];

@Module({
  imports: [CqrsModule, InventoryModule, AuthModule],
  controllers: [TransfersController],
  providers: [TransfersService, ...CommandHandlers],
  exports: [TransfersService],
})
export class TransfersModule {}
