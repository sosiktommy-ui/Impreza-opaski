import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransfersService, CreateTransferInput } from '../transfers.service';

export class CreateTransferCommand {
  constructor(public readonly input: CreateTransferInput) {}
}

@CommandHandler(CreateTransferCommand)
export class CreateTransferHandler
  implements ICommandHandler<CreateTransferCommand>
{
  constructor(private readonly transfersService: TransfersService) {}

  async execute(command: CreateTransferCommand) {
    return this.transfersService.createTransfer(command.input);
  }
}
