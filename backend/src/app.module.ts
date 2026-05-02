import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { SeedService } from './common/seed/seed.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CountriesModule } from './modules/countries/countries.module';
import { CitiesModule } from './modules/cities/cities.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HistoryModule } from './modules/history/history.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CountriesModule,
    CitiesModule,
    InventoryModule,
    TransfersModule,
    ExpensesModule,
    HistoryModule,
    EventsModule,
    HealthModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
