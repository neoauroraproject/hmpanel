import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
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
import { SettingsModule } from './settings/settings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { InboundsModule } from './inbounds/inbounds.module';
import { BackupsModule } from './backups/backups.module';
import { BulkClientsModule } from './bulk-clients/bulk-clients.module';
import { PlatformModule } from './platform/platform.module';
import { PluginsModule } from './plugins/plugins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'redis',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    PlatformModule,
    PluginsModule,
    PrismaModule,
    AuthModule,
    AdminsModule,
    ClientsModule,
    PanelsModule,
    TrafficModule,
    StatsModule,
    MigrationModule,
    SettingsModule,
    SubscriptionsModule,
    InboundsModule,
    BackupsModule,
    BulkClientsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
