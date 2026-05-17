import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { AuthModule } from '../auth/auth.module';
import { BalancesModule } from '../balances/balances.module';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [AuthModule, BalancesModule, AccessModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
