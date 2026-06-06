import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { ClientsModule } from './clients/clients.module';
import { PanelsModule } from './panels/panels.module';
import { TrafficModule } from './traffic/traffic.module';
import { StatsModule } from './stats/stats.module';
import { MigrationModule } from './migration/migration.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupsModule } from './backups/backups.module';
import { SettingsModule } from './settings/settings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { InboundsModule } from './inbounds/inbounds.module';
import { DomainsModule } from './domains/domains.module';
import { StoreModule } from './store/store.module';
import { ProModule } from './pro/pro.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AdminsModule,
    ClientsModule,
    PanelsModule,
    TrafficModule,
    StatsModule,
    MigrationModule,
    BackupsModule,
    SettingsModule,
    SubscriptionsModule,
    InboundsModule,
    DomainsModule,
    StoreModule,
    ProModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
