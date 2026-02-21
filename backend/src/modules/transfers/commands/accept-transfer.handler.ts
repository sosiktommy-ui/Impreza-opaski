import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService, AcceptanceItem } from '../transfers.service';

export class AcceptTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly items: AcceptanceItem[],
    public readonly actorId: string,
  ) {}
}

@CommandHandler(AcceptTransferCommand)
export class AcceptTransferHandler
  implements ICommandHandler<AcceptTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: AcceptTransferCommand) {
    return this.transfersService.acceptTransfer(
      command.transferId,
      command.items,
      command.actorId,
    );
  }
}
