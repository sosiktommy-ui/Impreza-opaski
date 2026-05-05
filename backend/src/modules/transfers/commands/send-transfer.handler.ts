import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService, SendTransferInput } from '../transfers.service';

export class SendTransferCommand {
  constructor(public readonly input: SendTransferInput) {}
}

@CommandHandler(SendTransferCommand)
export class SendTransferHandler
  implements ICommandHandler<SendTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: SendTransferCommand) {
    return this.transfersService.sendTransfer(command.input);
  }
}
