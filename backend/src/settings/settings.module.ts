import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { LicenseService } from './license.service';
import { SettingsController } from './settings.controller';
import { SslService } from './ssl.service';
import { SslController } from './ssl.controller';
import { DiagnosticService } from './diagnostic.service';
import { HmctlClient } from './hmctl.client';
import { PortsService } from './ports.service';
import { PortsController } from './ports.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    SettingsService,
    LicenseService,
    SslService,
    DiagnosticService,
    HmctlClient,
    PortsService,
  ],
  controllers: [SettingsController, SslController, PortsController],
  exports: [
    SettingsService,
    LicenseService,
    SslService,
    DiagnosticService,
    HmctlClient,
  ],
})
export class SettingsModule {}
