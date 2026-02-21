import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService, SendTransferInput } from '../transfers.service';

export class CreateTransferCommand {
  constructor(public readonly input: SendTransferInput) {}
}

@CommandHandler(CreateTransferCommand)
export class CreateTransferHandler
  implements ICommandHandler<CreateTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: CreateTransferCommand) {
    return this.transfersService.sendTransfer(command.input);
  }
}
