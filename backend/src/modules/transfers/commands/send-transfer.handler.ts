import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService } from '../transfers.service';

export class SendTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly actorId: string,
  ) {}
}

@CommandHandler(SendTransferCommand)
export class SendTransferHandler
  implements ICommandHandler<SendTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: SendTransferCommand) {
    return this.transfersService.sendTransfer(
      command.transferId,
      command.actorId,
    );
  }
}
