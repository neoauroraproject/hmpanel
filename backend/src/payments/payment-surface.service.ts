import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { PaymentManagementService } from './payment-management.service';
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
    @Optional() private paymentManagement?: PaymentManagementService,
  ) {}

  async resolve(
    surface: PaymentSurface,
    adminId?: string,
  ): Promise<{
    gateways: string[];
    default: string;
    assignmentEnabled: boolean;
    cardId?: string | null;
  }> {
    if (adminId && this.paymentManagement) {
      const resolved = await this.paymentManagement.resolveCheckout(adminId, surface);
      return {
        gateways: resolved.gateways,
        default: resolved.default,
        assignmentEnabled: resolved.assignmentEnabled,
        cardId: resolved.cardId,
      };
    }
    const registered = this.registry.list();
    const enabled = await this.flags.isEnabled(PLATFORM_FLAGS.PAYMENT_SURFACE_V1);
    if (!enabled) {
      const ids = registered.filter((id) => id === 'manual_bank' || id === 'wallet' || id === 'telegram_stars');
      const fallback = ids.length ? ids : ['manual_bank', 'wallet'];
      return {
        gateways: fallback,
        default: fallback.includes('manual_bank') ? 'manual_bank' : fallback[0],
        assignmentEnabled: false,
        cardId: null,
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
