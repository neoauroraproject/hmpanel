import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureFlagsService } from './architecture/feature-flags.service';
import { ArchitectureController } from './architecture.controller';
import { JobCenterController } from '../jobs/job-center.controller';
import { PermissionEngine } from '../authz/permission.engine';
import { PolicyEngine } from '../authz/policy.engine';
import { DomainEventBusService } from '../events/domain-event-bus.service';
import { JobCenterService } from '../jobs/job-center.service';
import { UnifiedMonitoringHub } from '../monitoring/unified-monitoring.hub';
import { PaymentGatewayRegistry } from '../payments/payment-gateway.registry';
import {
  ManualBankGateway,
  NowpaymentsStubGateway,
  WalletGateway,
  ZarinpalStubGateway,
} from '../payments/gateways/core-gateways';
import { ThemesService } from '../themes/themes.service';
import { ThemesController } from '../themes/themes.controller';
import { BotApiService } from '../bots/bot-api.service';
import { BotApiKeyGuard } from '../bots/bot-api.guard';
import { BotApiV1Controller } from '../bots/bot-api.controller';
import { TelegramCoreService } from '../bots/telegram-core.service';
import { ProvisioningEngine } from '../provisioning/provisioning.engine';
import {
  BASELINE_MIGRATION_STEPS,
  SchemaMigrationAdapter,
} from '../migration/schema-migration.adapter';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [
    ArchitectureController,
    ThemesController,
    BotApiV1Controller,
    JobCenterController,
  ],
  providers: [
    FeatureFlagsService,
    PermissionEngine,
    PolicyEngine,
    DomainEventBusService,
    JobCenterService,
    UnifiedMonitoringHub,
    PaymentGatewayRegistry,
    ManualBankGateway,
    WalletGateway,
    ZarinpalStubGateway,
    NowpaymentsStubGateway,
    ThemesService,
    BotApiService,
    BotApiKeyGuard,
    TelegramCoreService,
    ProvisioningEngine,
    {
      provide: SchemaMigrationAdapter,
      useFactory: () => new SchemaMigrationAdapter(BASELINE_MIGRATION_STEPS),
    },
  ],
  exports: [
    FeatureFlagsService,
    PermissionEngine,
    PolicyEngine,
    DomainEventBusService,
    JobCenterService,
    UnifiedMonitoringHub,
    PaymentGatewayRegistry,
    ThemesService,
    BotApiService,
    TelegramCoreService,
    ProvisioningEngine,
    SchemaMigrationAdapter,
  ],
})
export class ArchitectureModule implements OnModuleInit {
  constructor(
    private registry: PaymentGatewayRegistry,
    private manualBank: ManualBankGateway,
    private wallet: WalletGateway,
    private zarinpal: ZarinpalStubGateway,
    private nowpayments: NowpaymentsStubGateway,
  ) {}

  onModuleInit() {
    this.registry.register(this.manualBank);
    this.registry.register(this.wallet);
    this.registry.register(this.zarinpal);
    this.registry.register(this.nowpayments);
  }
}
