import { Global, Module, forwardRef } from '@nestjs/common';
import { LicenseManagerService } from './license-manager.service';
import { PlatformController, PremiumAssetsController } from './platform.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { PremiumBundleService } from './premium-bundle.service';
import { LicenseActivationService } from './license-activation.service';
import { LicenseHeartbeatScheduler } from './license-heartbeat.scheduler';
import { FeatureManagerService } from './feature-manager.service';
import { PremiumGuard } from '../common/guards/premium.guard';
import { PluginsModule } from '../plugins/plugins.module';

@Global()
@Module({
  imports: [PrismaModule, SettingsModule, forwardRef(() => PluginsModule)],
  controllers: [PlatformController, PremiumAssetsController],
  providers: [
    LicenseManagerService,
    FeatureManagerService,
    InstanceFingerprintService,
    PremiumBundleService,
    LicenseActivationService,
    LicenseHeartbeatScheduler,
    PremiumGuard,
  ],
  exports: [
    LicenseManagerService,
    FeatureManagerService,
    LicenseActivationService,
    PremiumBundleService,
    InstanceFingerprintService,
    PremiumGuard,
  ],
})
export class PlatformModule {}
