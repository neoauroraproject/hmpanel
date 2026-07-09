import { Global, Module } from '@nestjs/common';
import { LicenseManagerService } from './license-manager.service';
import { PlatformController } from './platform.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { PremiumBundleService } from './premium-bundle.service';
import { LicenseActivationService } from './license-activation.service';
import { LicenseHeartbeatScheduler } from './license-heartbeat.scheduler';
import { PremiumGuard } from '../common/guards/premium.guard';

@Global()
@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [PlatformController],
  providers: [
    LicenseManagerService,
    InstanceFingerprintService,
    PremiumBundleService,
    LicenseActivationService,
    LicenseHeartbeatScheduler,
    PremiumGuard,
  ],
  exports: [
    LicenseManagerService,
    LicenseActivationService,
    PremiumBundleService,
    InstanceFingerprintService,
    PremiumGuard,
  ],
})
export class PlatformModule {}
