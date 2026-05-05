import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService } from '../transfers.service';

export class CancelTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly actorId: string,
  ) {}
}

@CommandHandler(CancelTransferCommand)
export class CancelTransferHandler
  implements ICommandHandler<CancelTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: CancelTransferCommand) {
    return this.transfersService.cancelTransfer(
      command.transferId,
      command.actorId,
    );
  }
}
