import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/roles.guard';
import { CRITICAL_FLOWS } from './architecture/critical-flows.inventory';
import { FeatureFlagsService } from './architecture/feature-flags.service';
import type { PlatformFlagName } from './architecture/feature-flags';
import { JobCenterService } from '../jobs/job-center.service';
import { PaymentGatewayRegistry } from '../payments/payment-gateway.registry';
import { DomainEventBusService } from '../events/domain-event-bus.service';
import { SchemaMigrationAdapter, CURRENT_SCHEMA_VERSION } from '../migration/schema-migration.adapter';
import { UnifiedMonitoringHub } from '../monitoring/unified-monitoring.hub';

@ApiTags('Platform architecture')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('platform/architecture')
export class ArchitectureController {
  constructor(
    private flags: FeatureFlagsService,
    private jobs: JobCenterService,
    private payments: PaymentGatewayRegistry,
    private events: DomainEventBusService,
    private migrations: SchemaMigrationAdapter,
    private monitoring: UnifiedMonitoringHub,
  ) {}

  @Get('inventory')
  inventory() {
    return { flows: CRITICAL_FLOWS };
  }

  @Get('flags')
  flagsList() {
    return this.flags.getAll();
  }

  @Patch('flags')
  setFlags(@Body() body: Partial<Record<PlatformFlagName, boolean>>) {
    return this.flags.setFlags(body);
  }

  @Get('jobs')
  jobsList() {
    return this.jobs.list().then((items) => ({
      queues: this.jobs.queues(),
      items,
    }));
  }

  @Get('payments')
  paymentsList() {
    return { gateways: this.payments.list() };
  }

  @Get('events')
  eventsList() {
    return { recent: this.events.recent() };
  }

  @Get('schema')
  schema() {
    return { currentVersion: CURRENT_SCHEMA_VERSION, adapter: !!this.migrations };
  }

  @Get('monitoring')
  monitoringSnapshot() {
    return { samples: this.monitoring.snapshot() };
  }
}
