import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { LicenseService } from './license.service';
import { SettingsController } from './settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SettingsService, LicenseService],
  controllers: [SettingsController],
  exports: [SettingsService, LicenseService],
})
export class SettingsModule {}
