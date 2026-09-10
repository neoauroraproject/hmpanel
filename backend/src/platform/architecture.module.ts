import { Global, Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureFlagsService } from './architecture/feature-flags.service';
import { ArchitectureController } from './architecture.controller';
import { JobCenterController } from '../jobs/job-center.controller';
import { PermissionEngine } from '../authz/permission.engine';
import { PolicyEngine } from '../authz/policy.engine';
import { DomainEventBusService } from '../events/domain-event-bus.service';
import { JobCenterService } from '../jobs/job-center.service';
import {
  BackupsQueueProcessor,
  CleanupQueueProcessor,
} from '../jobs/platform-queues.processor';
import { UnifiedMonitoringHub } from '../monitoring/unified-monitoring.hub';
import { PaymentGatewayRegistry } from '../payments/payment-gateway.registry';
import {
  ManualBankGateway,
  NowpaymentsStubGateway,
  WalletGateway,
  ZarinpalStubGateway,
} from '../payments/gateways/core-gateways';
import { TelegramStarsGateway } from '../payments/gateways/telegram-stars.gateway';
import { TelegramWalletGateway } from '../payments/gateways/telegram-wallet.gateway';
import { PaymentLedgerService } from '../payments/payment-ledger.service';
import { PaymentManagementService } from '../payments/payment-management.service';
import { PaymentManagementController } from '../payments/payment-management.controller';
import { WalletPayWebhookController } from '../payments/wallet-pay-webhook.controller';
import { ThemesService } from '../themes/themes.service';
import { ThemesController } from '../themes/themes.controller';
import { BotApiService } from '../bots/bot-api.service';
import { BotApiKeyGuard } from '../bots/bot-api.guard';
import { BotApiV1Controller } from '../bots/bot-api.controller';
import { TelegramCoreService } from '../bots/telegram-core.service';
import { ProvisioningEngine } from '../provisioning/provisioning.engine';
import { WebhookDispatcher } from '../events/webhook-dispatcher.service';
import { PaymentSurfaceService } from '../payments/payment-surface.service';
import { PluginSlotRegistry } from '../plugins/plugin-slot.registry';
import { PluginHostService } from '../plugins/plugin-host.service';
import { DefaultCommercePipeline } from '../commerce/default-commerce.pipeline';
import {
  BASELINE_MIGRATION_STEPS,
  SchemaMigrationAdapter,
} from '../migration/schema-migration.adapter';

@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'monitoring' },
      { name: 'backups' },
      { name: 'cleanup' },
    ),
  ],
  controllers: [
    ArchitectureController,
    ThemesController,
    BotApiV1Controller,
    JobCenterController,
    PaymentManagementController,
    WalletPayWebhookController,
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
    TelegramStarsGateway,
    TelegramWalletGateway,
    PaymentLedgerService,
    PaymentManagementService,
    ThemesService,
    BotApiService,
    BotApiKeyGuard,
    TelegramCoreService,
    ProvisioningEngine,
    WebhookDispatcher,
    PaymentSurfaceService,
    PluginSlotRegistry,
    PluginHostService,
    DefaultCommercePipeline,
    BackupsQueueProcessor,
    CleanupQueueProcessor,
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
    PaymentLedgerService,
    PaymentManagementService,
    ThemesService,
    BotApiService,
    TelegramCoreService,
    ProvisioningEngine,
    WebhookDispatcher,
    PaymentSurfaceService,
    PluginSlotRegistry,
    PluginHostService,
    DefaultCommercePipeline,
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
    private telegramStars: TelegramStarsGateway,
    private telegramWallet: TelegramWalletGateway,
  ) {}

  onModuleInit() {
    this.registry.register(this.manualBank);
    this.registry.register(this.wallet);
    this.registry.register(this.telegramStars);
    this.registry.register(this.telegramWallet);
    this.registry.register(this.zarinpal);
    this.registry.register(this.nowpayments);
  }
}
