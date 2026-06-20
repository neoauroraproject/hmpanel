import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { LicenseService } from './license.service';
import { SettingsController } from './settings.controller';
import { SslService } from './ssl.service';
import { SslController } from './ssl.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SettingsService, LicenseService, SslService],
  controllers: [SettingsController, SslController],
  exports: [SettingsService, LicenseService, SslService],
})
export class SettingsModule {}
