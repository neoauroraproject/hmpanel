import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import {
  DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS,
  PAYMENT_SURFACE_SETTING_KEY,
  parsePaymentSurfaceAssignments,
  resolveSurfaceGateways,
  type PaymentSurface,
  type PaymentSurfaceAssignment,
} from './payment-surface';

@Injectable()
export class PaymentSurfaceService {
  constructor(
    private prisma: PrismaService,
    private flags: FeatureFlagsService,
    private registry: PaymentGatewayRegistry,
  ) {}

  async resolve(surface: PaymentSurface): Promise<{
    gateways: string[];
    default: string;
    assignmentEnabled: boolean;
  }> {
    const registered = this.registry.list();
    const enabled = await this.flags.isEnabled(PLATFORM_FLAGS.PAYMENT_SURFACE_V1);
    if (!enabled) {
      const ids = registered.length ? registered : ['manual_bank', 'wallet'];
      return {
        gateways: ids,
        default: ids.includes('manual_bank') ? 'manual_bank' : ids[0],
        assignmentEnabled: false,
      };
    }
    const assignments = await this.loadAssignments();
    return {
      ...resolveSurfaceGateways(assignments, surface, registered),
      assignmentEnabled: true,
    };
  }

  async loadAssignments(): Promise<PaymentSurfaceAssignment[]> {
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: PAYMENT_SURFACE_SETTING_KEY },
      });
      let parsed: unknown = null;
      if (row?.value) {
        try {
          parsed = JSON.parse(row.value);
        } catch {
          parsed = null;
        }
      }
      return parsePaymentSurfaceAssignments(parsed);
    } catch {
      return DEFAULT_PAYMENT_SURFACE_ASSIGNMENTS;
    }
  }
}
