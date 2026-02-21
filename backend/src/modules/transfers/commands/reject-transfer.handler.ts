import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService } from '../transfers.service';

export class RejectTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly reason: string,
    public readonly actorId: string,
  ) {}
}

@CommandHandler(RejectTransferCommand)
export class RejectTransferHandler
  implements ICommandHandler<RejectTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: RejectTransferCommand) {
    return this.transfersService.rejectTransfer(
      command.transferId,
      command.reason,
      command.actorId,
    );
  }
}
