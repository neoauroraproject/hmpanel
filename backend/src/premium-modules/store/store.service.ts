import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  forwardRef,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ensurePremiumSchema, prismaKnowsOrderIsTest } from '../ensure-premium-schema';
import { ClientsService } from '../../clients/clients.service';
import { BrandingService } from '../branding/branding.service';
import { StoreCustomerService } from './store-customer.service';
import { StoreCustomerAuthService } from './store-customer-auth.service';
import { StoreCustomerNotificationsService } from './store-customer-notifications.service';
import { StoreProvisioningService } from './store-provisioning.service';
import { StoreRateLimitService } from './store-rate-limit.service';
import { StoreTelegramService } from './store-telegram.service';
import { PaymentGatewayRegistry } from '../../payments/payment-gateway.registry';
import { PaymentSurfaceService } from '../../payments/payment-surface.service';
import { PaymentManagementService } from '../../payments/payment-management.service';
import { DomainEventBusService } from '../../events/domain-event-bus.service';
import { WALLET_PAY_GATEWAY } from '../../payments/telegram-wallet.util';
import { ThemesService } from '../../themes/themes.service';
import { StoreWalletService } from './store-wallet.service';
import { StoreCouponService } from './store-coupon.service';
import { StoreReferralRewardService } from './store-referral-reward.service';
import { EylanAddonService } from './providers/eylan/eylan-addon.service';
import { EylanFulfillmentProvider } from './providers/eylan/eylan.provider';
import { PasarguardAddonService } from './providers/pasarguard/pasarguard-addon.service';
import { PasarguardFulfillmentProvider } from './providers/pasarguard/pasarguard.provider';
import { AdminQuotaService } from '../../traffic/admin-quota.service';
import { AdminRechargeService } from '../admin-recharge/admin-recharge.service';
import { isNativeEylanSubUrl, parseEylanSubLink, extractSubTokenFromUrl } from './providers/eylan/eylan-url.util';
import { parsePasarguardSubLink } from './providers/pasarguard/pasarguard-url.util';
import {
  EYLAN_PROVIDER,
  EYLAN_VIRTUAL_PANEL_ID,
  PASARGUARD_PROVIDER,
  PASARGUARD_VIRTUAL_PANEL_ID,
  eylanServiceId,
  pasarguardServiceId,
  eylanSettingsHasSelection,
  isEylanProvider,
  isPasarguardProvider,
  parseEylanServiceId,
  parsePasarguardServiceId,
  parseEylanSettings,
  parseFulfillment,
  pasarguardSettingsHasSelection,
  parsePasarguardSettings,
  PANEL_3XUI_PROVIDER,
  isVirtualStorePanelId,
  providerIdFromStorePanelRef,
  storeProviderIdFromPanelType,
} from './providers/store-fulfillment.types';
import {
  CheckoutPayload,
  RenewCheckoutPayload,
  buildPrefixedTrackingCode,
  generateTrackingCode,
  generateTrackingPrefix,
  parseTrackingSequence,
} from './store.types';
import {
  normalizePaymentConfig,
  primaryCardFromConfig,
  STORE_PAYMENT_METHOD_META,
} from './payment-config';
import { StoreOrderStatus, Prisma, StorePaymentMethod } from '@prisma/client';

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly logger = new Logger(StoreService.name);
  private remediatingTrackingCodes = false;

  constructor(
    private prisma: PrismaService,
    private branding: BrandingService,
    private customers: StoreCustomerService,
    private customerAuth: StoreCustomerAuthService,
    private customerNotifications: StoreCustomerNotificationsService,
    private provisioning: StoreProvisioningService,
    private rateLimit: StoreRateLimitService,
    private clientsService: ClientsService,
    private wallet: StoreWalletService,
    private coupons: StoreCouponService,
    @Inject(forwardRef(() => StoreReferralRewardService))
    private referralRewards: StoreReferralRewardService,
    private eylanAddon: EylanAddonService,
    private eylanProvider: EylanFulfillmentProvider,
    private pasarguardAddon: PasarguardAddonService,
    private pasarguardProvider: PasarguardFulfillmentProvider,
    private adminQuota: AdminQuotaService,
    @Inject(forwardRef(() => StoreTelegramService))
    private telegram: StoreTelegramService,
    @Inject(forwardRef(() => AdminRechargeService))
    @Optional()
    private adminRecharge?: AdminRechargeService,
    @Optional() private payments?: PaymentGatewayRegistry,
    @Optional() private paymentSurfaces?: PaymentSurfaceService,
    @Optional() private paymentManagement?: PaymentManagementService,
    @Optional() private events?: DomainEventBusService,
    @Optional() private themes?: ThemesService,
  ) {}

  async onModuleInit() {
    void ensurePremiumSchema(this.prisma).catch((err: any) =>
      this.logger.warn(`Premium schema patch skipped: ${err?.message || err}`),
    );
    // Fire-and-forget: rewrite guessable numeric codes like "1020" → "X7K2-1020"
    void this.remediateSequentialTrackingCodes().catch((err: any) =>
      this.logger.warn(
        `Tracking-code remediation failed: ${err?.message || err}`,
      ),
    );
    this.events?.on('payment.verified', (event) => {
      void this.onWalletPayVerified(event.payload as Record<string, unknown>);
    });
  }

  private async onWalletPayVerified(payload: Record<string, unknown>) {
    if (String(payload?.gateway || '') !== WALLET_PAY_GATEWAY) return;
    const orderId = String(payload.orderId || '').trim();
    const surface = String(payload.surface || '');
    if (!orderId) return;
    try {
      if (surface === 'add_balance') {
        await this.adminRecharge?.fulfillVerifiedStarsRecharge(orderId, 'telegram_wallet');
        return;
      }
      if (surface === 'store' || surface === 'renewal') {
        await this.fulfillVerifiedExternalPayment(orderId, 'telegram_wallet');
      }
    } catch (err: any) {
      this.logger.warn(`Wallet Pay fulfill failed for ${orderId}: ${err?.message || err}`);
    }
  }

  /** Store checkout should call the Core payment plugin registry / surface assignment. */
  async listPaymentGateways(adminId?: string) {
    if (this.paymentManagement && adminId) {
      const assigned = await this.paymentManagement.resolveCheckout(adminId, 'store');
      return { gateways: assigned.gateways, default: assigned.default, cardId: assigned.cardId };
    }
    if (this.paymentSurfaces) {
      const assigned = await this.paymentSurfaces.resolve('store', adminId);
      return { gateways: assigned.gateways, default: assigned.default, cardId: assigned.cardId };
    }
    const registered = this.payments?.list() ?? [];
    const ids = registered.length ? registered : ['manual_bank', 'wallet'];
    return {
      gateways: ids,
      default: ids.includes('manual_bank') ? 'manual_bank' : ids[0],
    };
  }

  private gatewayId(method: StorePaymentMethod): 'wallet' | 'manual_bank' | 'telegram_stars' | 'telegram_wallet' {
    if (method === 'WALLET') return 'wallet';
    if (String(method) === 'TELEGRAM_STARS') return 'telegram_stars';
    if (String(method) === 'TELEGRAM_WALLET') return 'telegram_wallet';
    return 'manual_bank';
  }

  private isStarsMethod(method: string): boolean {
    return String(method).toUpperCase() === 'TELEGRAM_STARS';
  }

  private isWalletPayMethod(method: string): boolean {
    return String(method).toUpperCase() === 'TELEGRAM_WALLET';
  }

  async botPaymentSnapshot(
    adminId: string,
    surface: 'store' | 'renewal' | 'add_balance' = 'store',
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: {
        adminId: true,
        paymentConfig: true,
        bankName: true,
        bankCardNumber: true,
        bankCardHolder: true,
        bankIban: true,
        paymentInstructions: true,
        bankAccountInfo: true,
      },
    });
    if (!store) {
      return { cards: [] as Array<{ cardNumber?: string; bankName?: string; cardHolder?: string; iban?: string; instructions?: string }>, cardNumber: '', cardHolder: '', bankName: '', instructions: '' };
    }
    return this.resolveStorefrontPayment(store, surface);
  }

  private async resolveStorefrontPayment(store: {
    adminId: string;
    paymentConfig?: unknown;
    bankName?: string | null;
    bankCardNumber?: string | null;
    bankCardHolder?: string | null;
    bankIban?: string | null;
    paymentInstructions?: string | null;
    bankAccountInfo?: string | null;
  }, surface: 'store' | 'renewal' | 'add_balance' = 'store') {
    const paymentConfig = normalizePaymentConfig(store.paymentConfig, store);
    const fallbackCards = paymentConfig.cards.filter(
      (c) =>
        c.enabled !== false &&
        Boolean(c.cardNumber || c.bankName || c.iban || c.instructions),
    );
    const primary = fallbackCards[0] || primaryCardFromConfig(paymentConfig);
    const legacyCards =
      fallbackCards.length > 0
        ? fallbackCards
        : primary &&
            (primary.cardNumber ||
              primary.bankName ||
              primary.iban ||
              primary.instructions ||
              store.bankCardNumber)
          ? [
              {
                ...primary,
                id: primary.id || 'primary',
                bankName: primary.bankName || store.bankName || '',
                cardNumber: primary.cardNumber || store.bankCardNumber || '',
                cardHolder: primary.cardHolder || store.bankCardHolder || '',
                iban: primary.iban || store.bankIban || '',
                instructions: primary.instructions || store.paymentInstructions || '',
              },
            ]
          : [];
    let cards = legacyCards;
    let methods = STORE_PAYMENT_METHOD_META.map((method) => ({
      id: method.id,
      label: method.label,
      enabled: Boolean(paymentConfig.methods[method.id]),
      available: method.available,
    }));
    let defaultMethod = paymentConfig.methods.manual_bank !== false ? 'manual_bank' : 'none';
    if (this.paymentManagement) {
      try {
        const resolved = await this.paymentManagement.resolveCheckout(store.adminId, surface);
        defaultMethod = resolved.default;
        if (resolved.gateways.includes('manual_bank')) {
          cards = (resolved.cards.length ? resolved.cards : legacyCards).map((c) => ({
            id: c.id,
            bankName: c.bankName,
            cardNumber: c.cardNumber,
            cardHolder: c.cardHolder,
            iban: c.iban,
            instructions: c.instructions,
            enabled: c.enabled,
          }));
        } else {
          cards = [];
        }
        const byId = new Map(methods.map((m) => [m.id, m]));
        byId.set('manual_bank', {
          id: 'manual_bank',
          label: 'Card to Card',
          enabled: resolved.gateways.includes('manual_bank'),
          available: true,
        });
        byId.set('wallet', {
          id: 'wallet',
          label: 'Wallet',
          enabled: resolved.gateways.includes('wallet'),
          available: true,
        });
        byId.set('telegram_stars', {
          id: 'telegram_stars',
          label: 'Telegram Stars',
          enabled: resolved.gateways.includes('telegram_stars'),
          available: true,
        });
        byId.set('telegram_wallet', {
          id: 'telegram_wallet',
          label: 'Telegram Wallet Pay',
          enabled: resolved.gateways.includes('telegram_wallet'),
          available: true,
        });
        methods = [...byId.values()];
      } catch (err: any) {
        this.logger.warn(`resolveStorefrontPayment fallback: ${err?.message || err}`);
      }
    }
    const shownPrimary = cards[0];
    return {
      method: defaultMethod,
      methods,
      cards,
      instructions: shownPrimary?.instructions || store.paymentInstructions,
      cardNumber: shownPrimary?.cardNumber || store.bankCardNumber,
      cardHolder: shownPrimary?.cardHolder || store.bankCardHolder,
      bankName: shownPrimary?.bankName || store.bankName,
      iban: shownPrimary?.iban || store.bankIban,
      accountInfo: store.bankAccountInfo,
    };
  }

  private async recordGatewayPayment(
    method: StorePaymentMethod,
    input: { amount: number; currency: string; orderId: string },
    phase: 'create' | 'verify',
  ) {
    if (!this.payments) return;
    const id = this.gatewayId(method);
    try {
      const result =
        phase === 'create'
          ? await this.payments.createPayment(id, {
              amount: input.amount,
              currency: input.currency,
              orderId: input.orderId,
            })
          : await this.payments.verifyPayment(
              id,
              `${id === 'wallet' ? 'wal' : 'mb'}_${input.orderId}`,
            );
      if (result.status === 'paid') {
        await this.events?.emit('payment.verified', {
          orderId: input.orderId,
          gateway: id,
          status: result.status,
        });
        await this.events?.emit('order.paid', {
          orderId: input.orderId,
          gateway: id,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Payment registry ${phase} ${id}: ${err?.message || err}`);
    }
  }

  /**
   * Called after Telegram Stars successful_payment or Wallet Pay HMAC webhook
   * is verified on the ledger. Never delivers product until this path (or wallet/admin approve).
   */
  async fulfillVerifiedStarsOrder(orderId: string): Promise<{ ok: boolean; duplicate?: boolean }> {
    return this.fulfillVerifiedExternalPayment(orderId, 'telegram_stars');
  }

  async fulfillVerifiedExternalPayment(
    orderId: string,
    source: 'telegram_stars' | 'telegram_wallet',
  ): Promise<{ ok: boolean; duplicate?: boolean }> {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { adminId: true } }, payment: true },
    });
    if (!order) return { ok: false };
    if (['ACTIVE', 'RENEWED'].includes(order.status)) {
      return { ok: true, duplicate: true };
    }
    if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(order.status)) {
      return { ok: false };
    }
    const verifiedLabel =
      source === 'telegram_wallet' ? 'Telegram Wallet Pay payment verified' : 'Telegram Stars payment verified';
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'APPROVED', provisionError: null },
      });
      await tx.storePayment.updateMany({
        where: { orderId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: source,
        },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'APPROVED',
          message: verifiedLabel,
          actor: 'system',
        },
      });
    });
    try {
      await this.provisionOrder(order.store.adminId, 'ADMIN', orderId);
    } catch (err: any) {
      this.logger.error(`${source} provision failed for ${order.trackingCode}: ${err?.message || err}`);
    }
    return { ok: true };
  }

  /** Readable Telegram config base → jack1 / u482911 via provisioning. */
  buildTelegramConfigName(
    customer: {
      telegramUsername?: string | null;
      telegramUserId?: string | null;
      telegram?: string | null;
      name?: string | null;
    },
    adminId: string,
  ) {
    const fromUsername = String(customer.telegramUsername || customer.telegram || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/[^A-Za-z0-9_]/g, '');
    let base = '';
    if (fromUsername.length >= 2) {
      base = fromUsername.slice(0, 16).toLowerCase();
    } else {
      const tid = String(customer.telegramUserId || '').replace(/\D/g, '');
      if (tid.length >= 3) base = `u${tid.slice(-6)}`;
      else {
        const fromName = String(customer.name || '')
          .trim()
          .replace(/[^A-Za-z0-9_]/g, '');
        base = fromName.length >= 2 ? fromName.slice(0, 16).toLowerCase() : 'tg';
      }
    }
    return this.provisioning.generateUniqueConfigName(base, adminId);
  }

  private startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private startOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private normalizeIpLimitIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((v) => String(v || '').trim())
          .filter((v) => v.length > 0),
      ),
    ];
  }

  private normalizeAddonType(value: unknown): 'IP_LIMIT' | 'EXTRA_DAYS' {
    return String(value || '').toUpperCase() === 'EXTRA_DAYS' ? 'EXTRA_DAYS' : 'IP_LIMIT';
  }

  private normalizeAddonRow(row: any, currencyHint?: string) {
    const type = this.normalizeAddonType(row?.type);
    const toman =
      String(currencyHint || '')
        .toUpperCase()
        .includes('TOMAN') ||
      ['IRT', 'IRR', 'TMN'].includes(String(currencyHint || '').toUpperCase());
    const limitIp = Math.max(0, Math.floor(Number(row?.limitIp || 0)));
    const days = Math.max(0, Math.floor(Number(row?.days || 0)));
    const label = String(row?.label || '').trim();
    return {
      id: String(row?.id || ''),
      type,
      limitIp,
      days,
      label:
        label ||
        (type === 'EXTRA_DAYS'
          ? `+${days} days`
          : limitIp === 1
            ? '+1 user'
            : `+${limitIp} users`),
      priceExtraUsd: Math.max(0, Number(row?.priceExtraUsd || 0)),
      priceExtraToman: Math.max(0, Number(row?.priceExtraToman || 0)),
      sortOrder: Number(row?.sortOrder || 0),
      enabled: row?.enabled !== false,
      priceExtra: toman ? Math.max(0, Number(row?.priceExtraToman || 0)) : Math.max(0, Number(row?.priceExtraUsd || 0)),
    };
  }

  private async listRawAddonsByAdmin(adminId: string) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","adminId","type","days","limitIp","label","priceExtraUsd","priceExtraToman","sortOrder","enabled"
         FROM "StoreIpLimit"
         WHERE "adminId" = $1
         ORDER BY "sortOrder" ASC, "type" ASC, "limitIp" ASC, "days" ASC`,
        adminId,
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      const rows = await this.prisma.storeIpLimit.findMany({
        where: { adminId },
        orderBy: [{ sortOrder: 'asc' }, { limitIp: 'asc' }],
      });
      return rows.map((r) => ({ ...r, type: 'IP_LIMIT', days: 0 }));
    }
  }

  private async readBaseLimitIp(productId: string): Promise<number> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ baseLimitIp: number }>>(
        `SELECT "baseLimitIp" FROM "StoreProduct" WHERE "id" = $1`,
        productId,
      );
      return Math.max(0, Math.floor(Number(rows?.[0]?.baseLimitIp || 0)));
    } catch {
      return 0;
    }
  }

  private async writeBaseLimitIp(productId: string, value: number) {
    const n = Math.max(0, Math.floor(Number(value || 0)));
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "StoreProduct" SET "baseLimitIp" = $1 WHERE "id" = $2`,
        n,
        productId,
      );
    } catch (err: any) {
      this.logger.warn(`baseLimitIp write skipped: ${err?.message || err}`);
    }
  }

  private async countAddonsByIds(adminId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await this.listRawAddonsByAdmin(adminId);
    const set = new Set(ids);
    return rows.filter((row) => set.has(String(row?.id || ''))).length;
  }

  /** Legacy JSON on product → option rows (used only as fallback before migration). */
  private normalizeLegacyIpLimitOptions(value: unknown): Array<{
    limitIp: number;
    priceExtra: number;
    label: string;
    priceExtraUsd?: number;
    priceExtraToman?: number;
  }> {
    if (!Array.isArray(value)) return [];
    const out: Array<{
      limitIp: number;
      priceExtra: number;
      label: string;
      priceExtraUsd?: number;
      priceExtraToman?: number;
    }> = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const limitIp = Math.max(0, Math.floor(Number((raw as any).limitIp || 0)));
      if (!(limitIp > 0)) continue;
      const priceExtra = Math.max(0, Number((raw as any).priceExtra || 0));
      const label =
        String((raw as any).label || '').trim() ||
        (limitIp === 1 ? '1 user' : `${limitIp} users`);
      out.push({
        limitIp,
        priceExtra,
        label,
        priceExtraUsd: Math.max(0, Number((raw as any).priceExtraUsd ?? priceExtra)),
        priceExtraToman: Math.max(0, Number((raw as any).priceExtraToman ?? priceExtra)),
      });
    }
    return out;
  }

  private async resolveProductAddons(
    adminId: string,
    product: { ipLimitIds?: unknown; ipLimitOptions?: unknown },
    currencyHint?: string,
  ): Promise<Array<{ id: string; type: 'IP_LIMIT' | 'EXTRA_DAYS'; limitIp: number; days: number; priceExtra: number; label: string }>> {
    const ids = this.normalizeIpLimitIds(product.ipLimitIds);
    const toman =
      String(currencyHint || '')
        .toUpperCase()
        .includes('TOMAN') ||
      ['IRT', 'IRR', 'TMN'].includes(String(currencyHint || '').toUpperCase());
    if (ids.length) {
      const rows = await this.listRawAddonsByAdmin(adminId);
      return rows
        .filter((row) => ids.includes(String(row?.id || '')) && row?.enabled !== false)
        .map((row) => this.normalizeAddonRow(row, currencyHint))
        .map((row) => ({
          id: row.id,
          type: row.type,
          limitIp: row.limitIp,
          days: row.days,
          priceExtra: row.priceExtra,
          label: row.label,
        }));
    }

    // Fallback: legacy per-product JSON
    return this.normalizeLegacyIpLimitOptions(product.ipLimitOptions).map((o) => ({
      id: '',
      type: 'IP_LIMIT' as const,
      limitIp: o.limitIp,
      days: 0,
      label: o.label,
      priceExtra: toman
        ? Number(o.priceExtraToman ?? o.priceExtra)
        : Number(o.priceExtraUsd ?? o.priceExtra),
    }));
  }

  private async resolveProductIpOptions(
    adminId: string,
    product: { ipLimitIds?: unknown; ipLimitOptions?: unknown },
    currencyHint?: string,
  ): Promise<Array<{ id?: string; limitIp: number; priceExtra: number; label: string }>> {
    const addons = await this.resolveProductAddons(adminId, product, currencyHint);
    return addons
      .filter((a) => a.type === 'IP_LIMIT' && a.limitIp > 0)
      .map((a) => ({ id: a.id, limitIp: a.limitIp, priceExtra: a.priceExtra, label: a.label }));
  }

  private async resolveIpLimitChoice(
    adminId: string,
    product: { ipLimitIds?: unknown; ipLimitOptions?: unknown },
    requested: number | null | undefined,
    currencyHint?: string,
  ): Promise<{ limitIp: number | null; priceExtra: number; label: string | null }> {
    const options = await this.resolveProductIpOptions(adminId, product, currencyHint);
    if (!options.length) return { limitIp: null, priceExtra: 0, label: null };
    if (options.length === 1) {
      return {
        limitIp: options[0].limitIp,
        priceExtra: options[0].priceExtra,
        label: options[0].label,
      };
    }
    const wanted = Number(requested);
    const match = options.find((o) => o.limitIp === wanted);
    if (!match) {
      throw new BadRequestException('Select an IP / user limit option');
    }
    return { limitIp: match.limitIp, priceExtra: match.priceExtra, label: match.label };
  }

  private async resolveAddonSelection(
    adminId: string,
    product: { ipLimitIds?: unknown; ipLimitOptions?: unknown },
    selectedAddonIds: unknown,
    currencyHint?: string,
  ) {
    const all = await this.resolveProductAddons(adminId, product, currencyHint);
    const byId = new Map(all.filter((a) => !!a.id).map((a) => [a.id, a]));
    const selectedIds = this.normalizeIpLimitIds(selectedAddonIds);
    const selected = selectedIds.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
    if (selected.length !== selectedIds.length) {
      throw new BadRequestException('Invalid addon selection');
    }
    const extraDays = selected
      .filter((a) => a.type === 'EXTRA_DAYS')
      .reduce((sum, a) => sum + Number(a.days || 0), 0);
    const extraLimitIp = selected
      .filter((a) => a.type === 'IP_LIMIT')
      .reduce((sum, a) => sum + Number(a.limitIp || 0), 0);
    const extraPrice = selected.reduce((sum, a) => sum + Number(a.priceExtra || 0), 0);
    return { all, selected, selectedIds, extraDays, extraLimitIp, extraPrice };
  }

  private serializeProduct(p: any) {
    return {
      ...p,
      traffic: p.traffic?.toString?.() ?? p.traffic,
      ipLimitIds: this.normalizeIpLimitIds(p.ipLimitIds),
      // Resolved at request time for public/checkout; admin list shows legacy + ids
      ipLimitOptions: this.normalizeLegacyIpLimitOptions(p.ipLimitOptions),
      // Flatten for portal renew filtering (Eylan vs 3x-ui in the same category).
      providerId: p.profile?.providerId || p.providerId || undefined,
    };
  }

  private async enrichProductIpOptions(
    adminId: string,
    product: any,
    currencyHint?: string,
  ) {
    const base = this.serializeProduct(product);
    const options = await this.resolveProductAddons(adminId, product, currencyHint);
    const baseLimitIp = await this.readBaseLimitIp(String(product?.id || ''));
    return {
      ...base,
      baseLimitIp,
      ipLimitOptions: options.filter((o) => o.type === 'IP_LIMIT'),
      productAddons: options,
    };
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  private normalizeReorderIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique;
  }

  private async getAllowedInboundScope(adminId: string, role: string) {
    const inbounds = await this.prisma.inbound.findMany({
      where: role === 'SUPER_ADMIN' ? {} : { adminAccess: { some: { adminId } } },
      select: {
        id: true,
        tag: true,
        remark: true,
        port: true,
        protocol: true,
        panelId: true,
        panel: { select: { id: true, name: true, url: true, panelType: true } },
      },
      orderBy: [{ panel: { name: 'asc' } }, { tag: 'asc' }],
    });

    const panelsMap = new Map<string, { id: string; name: string; url: string; panelType?: string | null }>();
    for (const inbound of inbounds) {
      if (inbound.panel) {
        panelsMap.set(inbound.panel.id, inbound.panel);
      }
    }

    return {
      panels: [...panelsMap.values()],
      inbounds,
      inboundIds: new Set(inbounds.map((inbound) => inbound.id)),
      panelIds: new Set(inbounds.map((inbound) => inbound.panelId)),
    };
  }

  private async listStorePanels(adminId: string, role: string) {
    try {
      const where =
        role === 'SUPER_ADMIN'
          ? {}
          : {
              OR: [
                { inbounds: { some: { adminAccess: { some: { adminId } } } } },
                { connection: { adminId } },
              ],
            };
      return await this.prisma.panel.findMany({
        where,
        select: { id: true, name: true, url: true, panelType: true, connectionId: true },
        orderBy: { name: 'asc' },
      });
    } catch (err) {
      this.logger.warn(`listStorePanels failed: ${(err as Error)?.message || err}`);
      return [];
    }
  }

  private async resolveExternalProfilePanelId(
    adminId: string,
    role: string,
    panelId: string | null | undefined,
    expectedProvider: string,
  ): Promise<string | null> {
    const pid = String(panelId || '').trim();
    if (!pid || isVirtualStorePanelId(pid)) return null;
    const panel = await this.prisma.panel.findFirst({
      where: {
        id: pid,
        panelType: expectedProvider,
        ...(role === 'SUPER_ADMIN' ? {} : { connection: { adminId } }),
      },
      select: { id: true },
    });
    if (!panel) {
      throw new BadRequestException('Selected panel is not available for this account');
    }
    return panel.id;
  }

  async getProvisioningOptions(adminId: string, role: string) {
    let scope: Awaited<ReturnType<StoreService['getAllowedInboundScope']>> = {
      panels: [],
      inbounds: [],
      inboundIds: new Set<string>(),
      panelIds: new Set<string>(),
    };
    try {
      scope = await this.getAllowedInboundScope(adminId, role);
    } catch (err) {
      this.logger.warn(`getAllowedInboundScope failed: ${(err as Error)?.message || err}`);
    }

    const dbPanels = await this.listStorePanels(adminId, role);
    const panelById = new Map(dbPanels.map((p) => [p.id, p]));

    const xuiInbounds = scope.inbounds.filter((inbound) => {
      const panelType = inbound.panel?.panelType ?? panelById.get(inbound.panelId)?.panelType;
      const provider = storeProviderIdFromPanelType(panelType);
      return provider === PANEL_3XUI_PROVIDER;
    });

    const panelsFromDb = dbPanels.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      panelType: p.panelType || '3x-ui',
      providerId: storeProviderIdFromPanelType(p.panelType),
      connectionId: p.connectionId,
    }));

    const seen = new Set(panelsFromDb.map((p) => p.id));
    for (const inboundPanel of scope.panels) {
      if (seen.has(inboundPanel.id)) continue;
      const providerId = storeProviderIdFromPanelType(inboundPanel.panelType);
      if (providerId !== PANEL_3XUI_PROVIDER) continue;
      seen.add(inboundPanel.id);
      panelsFromDb.push({
        id: inboundPanel.id,
        name: inboundPanel.name,
        url: inboundPanel.url,
        panelType: inboundPanel.panelType || '3x-ui',
        providerId,
        connectionId: null,
      });
    }

    let eylan = { enabled: false, servers: [] as { id: string; name: string }[], wgInstances: [] as any[] };
    let pasarguard = { enabled: false, groups: [] as { id: number; name: string }[] };
    try {
      if (await this.eylanAddon.isEnabled(adminId)) {
        eylan = await this.eylanAddon.getOptions(adminId);
      }
    } catch (err) {
      this.logger.warn(`Eylan provisioning options: ${(err as Error)?.message || err}`);
    }
    try {
      if (await this.pasarguardAddon.isEnabled(adminId)) {
        pasarguard = await this.pasarguardAddon.getOptions(adminId);
      }
    } catch (err) {
      this.logger.warn(`Pasarguard provisioning options: ${(err as Error)?.message || err}`);
    }

    const hasEylanPanel = panelsFromDb.some((p) => p.providerId === EYLAN_PROVIDER);
    const hasPasarguardPanel = panelsFromDb.some((p) => p.providerId === PASARGUARD_PROVIDER);
    const eylanEnabled = hasEylanPanel || eylan.enabled;
    const pasarguardEnabled = hasPasarguardPanel || pasarguard.enabled;

    const panels = [
      ...panelsFromDb,
      ...(!hasEylanPanel && eylanEnabled
        ? [{ id: EYLAN_VIRTUAL_PANEL_ID, name: 'Eylan Panel', providerId: EYLAN_PROVIDER, url: '', panelType: EYLAN_PROVIDER, connectionId: null }]
        : []),
      ...(!hasPasarguardPanel && pasarguardEnabled
        ? [
            {
              id: PASARGUARD_VIRTUAL_PANEL_ID,
              name: 'Pasarguard Panel',
              providerId: PASARGUARD_PROVIDER,
              url: '',
              panelType: PASARGUARD_PROVIDER,
              connectionId: null,
            },
          ]
        : []),
    ];

    const eylanByPanelId: Record<string, typeof eylan> = {};
    const pasarguardByPanelId: Record<string, typeof pasarguard> = {};
    await Promise.all(
      panelsFromDb.map(async (panel) => {
        if (!panel.connectionId) return;
        try {
          if (panel.providerId === EYLAN_PROVIDER) {
            eylanByPanelId[panel.id] = await this.eylanAddon.getOptionsByConnectionId(panel.connectionId);
          } else if (panel.providerId === PASARGUARD_PROVIDER) {
            pasarguardByPanelId[panel.id] = await this.pasarguardAddon.getOptionsByConnectionId(panel.connectionId);
          }
        } catch (err) {
          this.logger.warn(`options for panel ${panel.id}: ${(err as Error)?.message || err}`);
        }
      }),
    );

    return {
      panels,
      inbounds: xuiInbounds,
      eylan,
      pasarguard,
      eylanByPanelId,
      pasarguardByPanelId,
    };
  }

  private async assertProfileScope(
    adminId: string,
    role: string,
    panelId: string,
    inboundIds: string[],
  ) {
    if (panelId === EYLAN_VIRTUAL_PANEL_ID) {
      throw new BadRequestException('Use Eylan profile settings instead of 3x-ui inbounds');
    }
    if (panelId === PASARGUARD_VIRTUAL_PANEL_ID) {
      throw new BadRequestException('Use Pasarguard profile settings instead of 3x-ui inbounds');
    }
    const selected = await this.prisma.panel.findUnique({
      where: { id: panelId },
      select: { panelType: true },
    });
    if (storeProviderIdFromPanelType(selected?.panelType) !== PANEL_3XUI_PROVIDER) {
      throw new BadRequestException('Selected panel is not a 3x-ui panel');
    }
    const scope = await this.getAllowedInboundScope(adminId, role);

    if (!scope.panelIds.has(panelId)) {
      throw new ForbiddenException('Selected panel is not available for this account');
    }
    if (inboundIds.length === 0) {
      throw new BadRequestException('At least one inbound is required');
    }
    for (const inboundId of inboundIds) {
      if (!scope.inboundIds.has(inboundId)) {
        throw new ForbiddenException('One or more selected inbounds are not available for this account');
      }
    }

    const crossPanel = scope.inbounds.filter(
      (inbound) => inboundIds.includes(inbound.id) && inbound.panelId !== panelId,
    );
    if (crossPanel.length > 0) {
      throw new BadRequestException('All selected inbounds must belong to the selected panel');
    }
  }

  private async ensureCategoryOwned(adminId: string, categoryId: string | null | undefined) {
    if (!categoryId) return;
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, adminId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  private async ensureProfileOwned(adminId: string, profileId: string) {
    const profile = await this.prisma.provisioningProfile.findFirst({
      where: { id: profileId, adminId },
      select: { id: true, providerId: true },
    });
    if (!profile) throw new NotFoundException('Provisioning profile not found');
    return profile;
  }

  private async assertPluginProfileUsable(adminId: string, profileId: string) {
    const profile = await this.prisma.provisioningProfile.findFirst({
      where: { id: profileId, adminId },
      select: { providerId: true },
    });
    if (isEylanProvider(profile?.providerId) && !(await this.eylanAddon.isEnabled(adminId))) {
      throw new BadRequestException('Eylan addon is disabled');
    }
    if (isPasarguardProvider(profile?.providerId) && !(await this.pasarguardAddon.isEnabled(adminId))) {
      throw new BadRequestException('Pasarguard addon is disabled');
    }
  }

  private async excludeDisabledPluginProducts<T extends { profile?: { providerId?: string | null } | null; profileId?: string }>(
    adminId: string,
    products: T[],
  ): Promise<T[]> {
    const eylanOn = await this.eylanAddon.isEnabled(adminId);
    const pasarguardOn = await this.pasarguardAddon.isEnabled(adminId);
    if (eylanOn && pasarguardOn) return products;
    const missing = products.filter((p) => !p.profile?.providerId && p.profileId);
    const ids = [...new Set(missing.map((p) => p.profileId!).filter(Boolean))];
    const map = new Map<string, string>();
    if (ids.length) {
      const rows = await this.prisma.provisioningProfile.findMany({
        where: { id: { in: ids } },
        select: { id: true, providerId: true },
      });
      for (const row of rows) map.set(row.id, row.providerId || PANEL_3XUI_PROVIDER);
    }
    return products.filter((p) => {
      const provider = p.profile?.providerId || (p.profileId ? map.get(p.profileId) : PANEL_3XUI_PROVIDER);
      if (isEylanProvider(provider) && !eylanOn) return false;
      if (isPasarguardProvider(provider) && !pasarguardOn) return false;
      return true;
    });
  }

  private async serializeProfile(profile: any) {
    const inboundIds = this.normalizeStringArray(profile.inboundIds);
    const inboundRecords = inboundIds.length
      ? await this.prisma.inbound.findMany({
          where: { id: { in: inboundIds } },
          select: {
            id: true,
            tag: true,
            remark: true,
            port: true,
            protocol: true,
            panelId: true,
            panel: { select: { id: true, name: true } },
          },
          orderBy: { tag: 'asc' },
        })
      : [];

    return {
      ...profile,
      providerId: profile.providerId || PANEL_3XUI_PROVIDER,
      inboundIds,
      inbounds: inboundRecords,
      panelId:
        profile.panelId ||
        (isEylanProvider(profile.providerId)
          ? EYLAN_VIRTUAL_PANEL_ID
          : isPasarguardProvider(profile.providerId)
            ? PASARGUARD_VIRTUAL_PANEL_ID
            : profile.panelId),
      panel:
        profile.panel ||
        (isEylanProvider(profile.providerId)
          ? { id: EYLAN_VIRTUAL_PANEL_ID, name: 'Eylan Panel' }
          : isPasarguardProvider(profile.providerId)
            ? { id: PASARGUARD_VIRTUAL_PANEL_ID, name: 'Pasarguard Panel' }
            : null),
      settings: isEylanProvider(profile.providerId)
        ? parseEylanSettings(profile.settings)
        : isPasarguardProvider(profile.providerId)
          ? parsePasarguardSettings(profile.settings)
          : profile.settings,
    };
  }

  private serializeStoreProfile(profile: any) {
    const paymentConfig = normalizePaymentConfig(profile.paymentConfig, profile);
    const domain = profile.domain || null;
    const customHost =
      domain?.domain &&
      (domain.status === 'SSL_ACTIVE' || domain.status === 'VERIFIED')
        ? String(domain.domain).split(':')[0].trim()
        : null;
    const panelHost = String(process.env.PANEL_DOMAIN || process.env.DOMAIN || '')
      .split(':')[0]
      .trim();
    const host = customHost || panelHost;
    const proto = process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
    const storefrontUrl =
      host && profile.slug
        ? `${proto}://${host}/shop/${encodeURIComponent(profile.slug)}`
        : profile.slug
          ? `/shop/${encodeURIComponent(profile.slug)}`
          : null;
    return {
      ...profile,
      paymentConfig,
      subscriptionLinkMode:
        profile.subscriptionLinkMode === 'native' ? 'native' : 'hmpanel',
      storefrontUrl,
      customDomain: customHost,
    };
  }

  async getOrCreateProfile(adminId: string) {
    const existing = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (existing) return this.serializeStoreProfile(existing);

    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    const slugBase = `${admin?.username || 'store'}-${Date.now().toString(36)}`;
    try {
      const created = await this.prisma.storeProfile.create({
        data: {
          adminId,
          slug: slugBase,
          title: `${admin?.username || 'My'} Store`,
        },
        include: { domain: { select: { domain: true, status: true } } },
      });
      return this.serializeStoreProfile(created);
    } catch (err: any) {
      // Concurrent create — unique adminId already exists
      if (err?.code === 'P2002') {
        const again = await this.prisma.storeProfile.findUnique({
          where: { adminId },
          include: { domain: { select: { domain: true, status: true } } },
        });
        if (again) return this.serializeStoreProfile(again);
      }
      throw err;
    }
  }

  async updateStoreProfile(adminId: string, data: Record<string, unknown>) {
    await this.getOrCreateProfile(adminId);

    const paymentConfig =
      data.paymentConfig !== undefined
        ? normalizePaymentConfig(data.paymentConfig, {
            bankName: data.bankName as string | undefined,
            bankCardNumber: data.bankCardNumber as string | undefined,
            bankCardHolder: data.bankCardHolder as string | undefined,
            bankIban: data.bankIban as string | undefined,
            paymentInstructions: data.paymentInstructions as string | undefined,
          })
        : undefined;

    const primary = paymentConfig ? primaryCardFromConfig(paymentConfig) : null;

    const autoDeliverEnabled =
      data.autoDeliverEnabled !== undefined ? Boolean(data.autoDeliverEnabled) : undefined;
    let autoDeliverDelayMinutes: number | undefined;
    if (data.autoDeliverDelayMinutes !== undefined) {
      const n = Math.floor(Number(data.autoDeliverDelayMinutes));
      if (!Number.isFinite(n) || n < 1 || n > 24 * 60) {
        throw new BadRequestException('autoDeliverDelayMinutes must be between 1 and 1440');
      }
      autoDeliverDelayMinutes = n;
    }

    let subscriptionLinkMode: string | undefined;
    if (data.subscriptionLinkMode !== undefined) {
      const mode = String(data.subscriptionLinkMode || '').toLowerCase();
      if (mode !== 'hmpanel' && mode !== 'native') {
        throw new BadRequestException('subscriptionLinkMode must be "hmpanel" or "native"');
      }
      subscriptionLinkMode = mode;
    }

    const updated = await this.prisma.storeProfile.update({
      where: { adminId },
      data: {
        title: data.title as string | undefined,
        slug: data.slug as string | undefined,
        description: data.description as string | undefined,
        domainId: data.domainId as string | undefined,
        enabled: data.enabled as boolean | undefined,
        defaultCurrency: data.defaultCurrency as string | undefined,
        paymentConfig: paymentConfig as any,
        autoDeliverEnabled,
        autoDeliverDelayMinutes,
        subscriptionLinkMode,
        // Keep legacy flat fields synced with the first enabled card
        paymentInstructions:
          (primary?.instructions as string | undefined) ??
          (data.paymentInstructions as string | undefined),
        bankName:
          (primary?.bankName as string | undefined) ?? (data.bankName as string | undefined),
        bankCardNumber:
          (primary?.cardNumber as string | undefined) ??
          (data.bankCardNumber as string | undefined),
        bankCardHolder:
          (primary?.cardHolder as string | undefined) ??
          (data.bankCardHolder as string | undefined),
        bankIban:
          (primary?.iban as string | undefined) ?? (data.bankIban as string | undefined),
        bankAccountInfo: data.bankAccountInfo as string | undefined,
        theme: typeof data.theme === 'string' ? data.theme : undefined,
      },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (paymentConfig?.cards?.length && this.paymentManagement) {
      try {
        await this.paymentManagement.importStoreCards(adminId, paymentConfig.cards);
      } catch (err: any) {
        this.logger.warn(`importStoreCards skipped: ${err?.message || err}`);
      }
    }
    return this.serializeStoreProfile(updated);
  }

  async getDashboard(adminId: string) {
    const today = this.startOfDay();
    const monthStart = this.startOfMonth();
    const store = await this.getOrCreateProfile(adminId);

    const pendingStatuses: StoreOrderStatus[] = [
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'PROVISIONING',
      'PROVISION_FAILED',
    ];

    const reviewStatuses: StoreOrderStatus[] = [
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'PROVISION_FAILED',
    ];

    const [
      todayOrders,
      pendingOrders,
      newOrders,
      completedOrders,
      revenueOrdersToday,
      revenueOrdersMonth,
      activeProducts,
      customers,
      renewals,
    ] = await Promise.all([
      this.prisma.storeOrder.count({
        where: {
          storeId: store.id,
          createdAt: { gte: today },
          // Don't inflate "today orders" with cancelled/rejected
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
      }),
      this.prisma.storeOrder.count({
        where: {
          storeId: store.id,
          status: { in: pendingStatuses },
        },
      }),
      this.prisma.storeOrder.count({
        where: {
          storeId: store.id,
          OR: [
            { status: { in: reviewStatuses } },
            // Auto-delivered / tagged review only while service is still live.
            // Terminal statuses (CANCELLED/REJECTED/EXPIRED) must never keep the badge.
            {
              pendingReview: true,
              status: { in: ['ACTIVE', 'RENEWED', 'APPROVED', 'PROVISIONING'] },
            },
          ],
        },
      }),
      this.prisma.storeOrder.count({
        where: { storeId: store.id, status: { in: ['ACTIVE', 'RENEWED'] } },
      }),
      // Revenue = completed orders only (never CANCELLED / REJECTED / mere APPROVED)
      this.prisma.storeOrder.findMany({
        where: {
          storeId: store.id,
          createdAt: { gte: today },
          status: { in: ['ACTIVE', 'RENEWED'] },
          OR: [{ payment: { is: null } }, { payment: { status: 'APPROVED' } }],
        },
        select: {
          amount: true,
          currency: true,
          product: { select: { priceToman: true, priceUsd: true } },
        },
      }),
      this.prisma.storeOrder.findMany({
        where: {
          storeId: store.id,
          createdAt: { gte: monthStart },
          status: { in: ['ACTIVE', 'RENEWED'] },
          OR: [{ payment: { is: null } }, { payment: { status: 'APPROVED' } }],
        },
        select: {
          amount: true,
          currency: true,
          product: { select: { priceToman: true, priceUsd: true } },
        },
      }),
      this.prisma.storeProduct.count({
        where: { adminId, status: 'active', visible: true },
      }),
      this.prisma.storeCustomer.count({ where: { adminId } }),
      this.prisma.storeOrder.count({
        where: { storeId: store.id, isRenewal: true, status: { in: ['ACTIVE', 'RENEWED'] } },
      }),
    ]);

    let testsSent = 0;
    let testsDelivered = 0;
    try {
      await ensurePremiumSchema(this.prisma);
      if (prismaKnowsOrderIsTest()) {
        [testsSent, testsDelivered] = await Promise.all([
          this.prisma.storeOrder.count({
            where: {
              storeId: store.id,
              createdAt: { gte: today },
              OR: [{ isTest: true }, { product: { isTest: true } }],
            },
          }),
          this.prisma.storeOrder.count({
            where: {
              storeId: store.id,
              createdAt: { gte: today },
              status: { in: ['ACTIVE', 'RENEWED'] },
              OR: [{ isTest: true }, { product: { isTest: true } }],
            },
          }),
        ]);
      } else {
        const [sentRows, deliveredRows] = await Promise.all([
          this.prisma.$queryRaw<Array<{ n: number }>>`
            SELECT COUNT(*)::int AS n
            FROM "StoreOrder" o
            LEFT JOIN "StoreProduct" p ON p.id = o."productId"
            WHERE o."storeId" = ${store.id}
              AND o."createdAt" >= ${today}
              AND (o."isTest" = true OR p."isTest" = true)
          `,
          this.prisma.$queryRaw<Array<{ n: number }>>`
            SELECT COUNT(*)::int AS n
            FROM "StoreOrder" o
            LEFT JOIN "StoreProduct" p ON p.id = o."productId"
            WHERE o."storeId" = ${store.id}
              AND o."createdAt" >= ${today}
              AND o.status IN ('ACTIVE', 'RENEWED')
              AND (o."isTest" = true OR p."isTest" = true)
          `,
        ]);
        testsSent = Number(sentRows[0]?.n || 0);
        testsDelivered = Number(deliveredRows[0]?.n || 0);
      }
    } catch {
      testsSent = 0;
      testsDelivered = 0;
    }

    const sumByCurrency = (
      rows: {
        amount: number | null;
        currency: string | null;
        product?: { priceToman?: number | null; priceUsd?: number | null } | null;
      }[],
    ) => {
      let usd = 0;
      let toman = 0;
      for (const row of rows) {
        const cur = String(row.currency || '').toUpperCase();
        const isTomanCur = ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(cur);
        const productToman = Number(row.product?.priceToman || 0);
        const productUsd = Number(row.product?.priceUsd || 0);
        let n = Number(row.amount || 0);
        // Match OrderAmountCell: when amount is 0, fall back to product prices
        if (n === 0) {
          if (isTomanCur || productToman > 0) n = productToman || productUsd;
          else n = productUsd || productToman;
        }
        if (isTomanCur || (Number(row.amount || 0) === 0 && productToman > 0)) {
          toman += n;
        } else {
          usd += n;
        }
      }
      return { usd, toman };
    };

    const todayRev = sumByCurrency(revenueOrdersToday);
    const monthRev = sumByCurrency(revenueOrdersMonth);

    return {
      todayOrders,
      pendingOrders,
      newOrders,
      completedOrders,
      revenueToday: todayRev.usd,
      revenueMonth: monthRev.usd,
      revenueTodayToman: todayRev.toman,
      revenueMonthToman: monthRev.toman,
      activeProducts,
      customers,
      renewals,
      testsSent,
      testsDelivered,
      storeSlug: store.slug,
      storefrontUrl: store.storefrontUrl || null,
      customDomain: store.customDomain || null,
    };
  }

  async getRevenueByMonth(adminId: string, year: number) {
    const store = await this.getOrCreateProfile(adminId);
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        storeId: store.id,
        createdAt: { gte: start, lt: end },
        status: { in: ['ACTIVE', 'RENEWED'] },
        OR: [{ payment: { is: null } }, { payment: { status: 'APPROVED' } }],
      },
      select: {
        amount: true,
        currency: true,
        createdAt: true,
        product: { select: { priceToman: true, priceUsd: true } },
      },
    });
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      usd: 0,
      toman: 0,
      orders: 0,
    }));
    for (const o of orders) {
      const m = o.createdAt.getMonth();
      const cur = String(o.currency || '').toUpperCase();
      const isToman = ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(cur);
      const productToman = Number(o.product?.priceToman || 0);
      const productUsd = Number(o.product?.priceUsd || 0);
      let n = Number(o.amount) || 0;
      if (n === 0) {
        if (isToman || productToman > 0) n = productToman || productUsd;
        else n = productUsd || productToman;
      }
      if (isToman || (Number(o.amount || 0) === 0 && productToman > 0)) {
        months[m].toman += n;
      } else {
        months[m].usd += n;
      }
      months[m].orders += 1;
    }
    const yearToman = months.reduce((s, x) => s + x.toman, 0);
    const yearUsd = months.reduce((s, x) => s + x.usd, 0);
    return {
      year,
      defaultCurrency: store.defaultCurrency || 'USD',
      months,
      yearToman,
      yearUsd,
    };
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  listCategories(adminId: string) {
    return this.prisma.productCategory.findMany({
      where: { adminId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  createCategory(adminId: string, data: Record<string, unknown>) {
    return this.prisma.productCategory.create({
      data: {
        adminId,
        name: data.name as string,
        description: (data.description as string) || null,
        icon: (data.icon as string) || null,
        sortOrder: Number(data.sortOrder ?? 0),
        visible: data.visible !== false,
        enabled: data.enabled !== false,
      },
    });
  }

  async updateCategory(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.productCategory.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.productCategory.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        icon: data.icon as string | undefined,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : undefined,
        visible: data.visible as boolean | undefined,
        enabled: data.enabled as boolean | undefined,
      },
    });
  }

  async reorderCategories(adminId: string, ids: string[]) {
    const unique = this.normalizeReorderIds(ids);
    if (!unique.length) throw new BadRequestException('ids required');
    const owned = await this.prisma.productCategory.findMany({
      where: { adminId, id: { in: unique } },
      select: { id: true },
    });
    if (owned.length !== unique.length) throw new BadRequestException('Invalid category ids');
    await this.prisma.$transaction(
      unique.map((id, index) =>
        this.prisma.productCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  async deleteCategory(adminId: string, id: string) {
    const existing = await this.prisma.productCategory.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Category not found');
    const productCount = await this.prisma.storeProduct.count({
      where: { categoryId: id, adminId, NOT: { status: 'archived' } },
    });
    if (productCount > 0) {
      // Soft-retire so historical orders keep their category FK / storefront can hide it.
      await this.prisma.productCategory.update({
        where: { id },
        data: { visible: false, enabled: false },
      });
      return { deleted: true, id, soft: true };
    }
    try {
      await this.prisma.productCategory.delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        await this.prisma.productCategory.update({
          where: { id },
          data: { visible: false, enabled: false },
        });
        return { deleted: true, id, soft: true };
      }
      throw err;
    }
    return { deleted: true, id };
  }

  // ── Provisioning Profiles ──────────────────────────────────────────────────

  async listProfiles(adminId: string) {
    const profiles = await this.prisma.provisioningProfile.findMany({
      where: { adminId },
      include: { panel: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return Promise.all(profiles.map((profile) => this.serializeProfile(profile)));
  }

  async createProfile(adminId: string, role: string, data: Record<string, unknown>) {
    let providerId = providerIdFromStorePanelRef({
      panelId: data.panelId as string | undefined,
      providerId: data.providerId as string | undefined,
    });
    if (
      providerId === PANEL_3XUI_PROVIDER &&
      data.panelId &&
      !isVirtualStorePanelId(data.panelId as string)
    ) {
      const panel = await this.prisma.panel.findUnique({
        where: { id: data.panelId as string },
        select: { panelType: true },
      });
      providerId = storeProviderIdFromPanelType(panel?.panelType);
    }

    if (isEylanProvider(providerId)) {
      const nativePanelId = await this.resolveExternalProfilePanelId(
        adminId,
        role,
        data.panelId as string | undefined,
        EYLAN_PROVIDER,
      );
      if (!nativePanelId && !(await this.eylanAddon.isEnabled(adminId))) {
        throw new BadRequestException('Eylan addon is not enabled');
      }
      const settings = parseEylanSettings(data.settings);
      if (!eylanSettingsHasSelection(settings)) {
        throw new BadRequestException('Select at least one Eylan protocol or location');
      }
      const profile = await this.prisma.provisioningProfile.create({
        data: {
          adminId,
          name: data.name as string,
          description: (data.description as string) || null,
          providerId: EYLAN_PROVIDER,
          panelId: nativePanelId,
          inboundIds: [],
          protocol: (data.protocol as string) || null,
          settings: settings as unknown as Prisma.InputJsonValue,
          renewalPolicy: (data.renewalPolicy as Prisma.InputJsonValue) ?? undefined,
          clientPolicy: (data.clientPolicy as Prisma.InputJsonValue) ?? undefined,
          enabled: data.enabled !== false,
        },
      });
      return this.serializeProfile(profile);
    }

    if (isPasarguardProvider(providerId)) {
      const nativePanelId = await this.resolveExternalProfilePanelId(
        adminId,
        role,
        data.panelId as string | undefined,
        PASARGUARD_PROVIDER,
      );
      if (!nativePanelId && !(await this.pasarguardAddon.isEnabled(adminId))) {
        throw new BadRequestException('Pasarguard addon is not enabled');
      }
      const settings = parsePasarguardSettings(data.settings);
      if (!pasarguardSettingsHasSelection(settings)) {
        throw new BadRequestException('Select at least one Pasarguard group');
      }
      const profile = await this.prisma.provisioningProfile.create({
        data: {
          adminId,
          name: data.name as string,
          description: (data.description as string) || null,
          providerId: PASARGUARD_PROVIDER,
          panelId: nativePanelId,
          inboundIds: [],
          protocol: (data.protocol as string) || null,
          settings: settings as unknown as Prisma.InputJsonValue,
          renewalPolicy: (data.renewalPolicy as Prisma.InputJsonValue) ?? undefined,
          clientPolicy: (data.clientPolicy as Prisma.InputJsonValue) ?? undefined,
          enabled: data.enabled !== false,
        },
      });
      return this.serializeProfile(profile);
    }

    const panelId = data.panelId as string;
    const inboundIds = this.normalizeStringArray(data.inboundIds);
    await this.assertProfileScope(adminId, role, panelId, inboundIds);

    const profile = await this.prisma.provisioningProfile.create({
      data: {
        adminId,
        name: data.name as string,
        description: (data.description as string) || null,
        providerId: PANEL_3XUI_PROVIDER,
        panelId,
        inboundIds,
        protocol: (data.protocol as string) || null,
        settings: (data.settings as Prisma.InputJsonValue) ?? undefined,
        renewalPolicy: (data.renewalPolicy as Prisma.InputJsonValue) ?? undefined,
        clientPolicy: (data.clientPolicy as Prisma.InputJsonValue) ?? undefined,
        enabled: data.enabled !== false,
      },
    });
    return this.serializeProfile(profile);
  }

  async updateProvisioningProfile(adminId: string, role: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.provisioningProfile.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Provisioning profile not found');

    const nextProvider = providerIdFromStorePanelRef({
      panelId: (data.panelId as string | undefined) ?? existing.panelId,
      providerId: (data.providerId as string | undefined) ?? existing.providerId,
    });

    if ((existing.providerId || PANEL_3XUI_PROVIDER) !== nextProvider) {
      throw new BadRequestException('Cannot change a profile provider type');
    }

    if (isEylanProvider(nextProvider)) {
      const settings =
        data.settings !== undefined ? parseEylanSettings(data.settings) : parseEylanSettings(existing.settings);
      if (!eylanSettingsHasSelection(settings)) {
        throw new BadRequestException('Select at least one Eylan protocol or location');
      }
      const nativePanelId =
        data.panelId !== undefined
          ? await this.resolveExternalProfilePanelId(adminId, role, data.panelId as string, EYLAN_PROVIDER)
          : existing.panelId;
      const profile = await this.prisma.provisioningProfile.update({
        where: { id },
        data: {
          name: data.name as string | undefined,
          description: data.description as string | undefined,
          providerId: EYLAN_PROVIDER,
          panelId: nativePanelId,
          inboundIds: [],
          protocol: data.protocol as string | undefined,
          settings: settings as unknown as Prisma.InputJsonValue,
          renewalPolicy: data.renewalPolicy as Prisma.InputJsonValue | undefined,
          clientPolicy: data.clientPolicy as Prisma.InputJsonValue | undefined,
          enabled: data.enabled as boolean | undefined,
        },
      });
      return this.serializeProfile(profile);
    }

    if (isPasarguardProvider(nextProvider)) {
      const settings =
        data.settings !== undefined
          ? parsePasarguardSettings(data.settings)
          : parsePasarguardSettings(existing.settings);
      if (!pasarguardSettingsHasSelection(settings)) {
        throw new BadRequestException('Select at least one Pasarguard group');
      }
      const nativePanelId =
        data.panelId !== undefined
          ? await this.resolveExternalProfilePanelId(adminId, role, data.panelId as string, PASARGUARD_PROVIDER)
          : existing.panelId;
      const profile = await this.prisma.provisioningProfile.update({
        where: { id },
        data: {
          name: data.name as string | undefined,
          description: data.description as string | undefined,
          providerId: PASARGUARD_PROVIDER,
          panelId: nativePanelId,
          inboundIds: [],
          protocol: data.protocol as string | undefined,
          settings: settings as unknown as Prisma.InputJsonValue,
          renewalPolicy: data.renewalPolicy as Prisma.InputJsonValue | undefined,
          clientPolicy: data.clientPolicy as Prisma.InputJsonValue | undefined,
          enabled: data.enabled as boolean | undefined,
        },
      });
      return this.serializeProfile(profile);
    }

    const panelId = (data.panelId as string | undefined) ?? existing.panelId;
    if (!panelId) throw new BadRequestException('Panel is required');
    const inboundIds =
      data.inboundIds !== undefined
        ? this.normalizeStringArray(data.inboundIds)
        : this.normalizeStringArray(existing.inboundIds);
    await this.assertProfileScope(adminId, role, panelId, inboundIds);

    const profile = await this.prisma.provisioningProfile.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        providerId: PANEL_3XUI_PROVIDER,
        panelId: data.panelId as string | undefined,
        inboundIds: data.inboundIds !== undefined ? inboundIds : undefined,
        protocol: data.protocol as string | undefined,
        settings: data.settings as Prisma.InputJsonValue | undefined,
        renewalPolicy: data.renewalPolicy as Prisma.InputJsonValue | undefined,
        clientPolicy: data.clientPolicy as Prisma.InputJsonValue | undefined,
        enabled: data.enabled as boolean | undefined,
      },
    });
    return this.serializeProfile(profile);
  }

  async deleteProfile(adminId: string, id: string) {
    const existing = await this.prisma.provisioningProfile.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Provisioning profile not found');
    const productCount = await this.prisma.storeProduct.count({ where: { profileId: id, adminId } });
    if (productCount > 0) {
      throw new BadRequestException('Cannot delete provisioning profile with linked products');
    }
    await this.prisma.provisioningProfile.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── Product Templates ──────────────────────────────────────────────────────

  async listTemplates(adminId: string) {
    const items = await this.prisma.productTemplate.findMany({
      where: { adminId },
      include: { profile: { include: { panel: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((t) => this.serializeProduct(t));
  }

  async createTemplate(adminId: string, data: Record<string, unknown>) {
    if (data.profileId) {
      await this.ensureProfileOwned(adminId, data.profileId as string);
    }
    return this.prisma.productTemplate.create({
      data: {
        adminId,
        profileId: (data.profileId as string) || null,
        name: data.name as string,
        description: (data.description as string) || null,
        priceToman: data.priceToman != null ? Number(data.priceToman) : null,
        priceUsd: Number(data.priceUsd ?? 0),
        traffic: BigInt(data.traffic as string | number || 0),
        durationDays: Number(data.durationDays ?? 30),
        inboundIds: (data.inboundIds as Prisma.InputJsonValue) ?? undefined,
        locationSet: (data.locationSet as string) || null,
      },
    });
  }

  async updateTemplate(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.productTemplate.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (data.profileId) {
      await this.ensureProfileOwned(adminId, data.profileId as string);
    }
    return this.prisma.productTemplate.update({
      where: { id },
      data: {
        profileId: data.profileId !== undefined ? ((data.profileId as string) || null) : undefined,
        name: data.name as string | undefined,
        description: data.description !== undefined ? ((data.description as string) || null) : undefined,
        priceToman: data.priceToman != null ? Number(data.priceToman) : undefined,
        priceUsd: data.priceUsd != null ? Number(data.priceUsd) : undefined,
        traffic: data.traffic != null ? BigInt(data.traffic as string | number) : undefined,
        durationDays: data.durationDays != null ? Number(data.durationDays) : undefined,
        inboundIds: data.inboundIds as Prisma.InputJsonValue | undefined,
        locationSet: data.locationSet !== undefined ? ((data.locationSet as string) || null) : undefined,
      },
    });
  }

  async deleteTemplate(adminId: string, id: string) {
    const existing = await this.prisma.productTemplate.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Template not found');
    await this.prisma.productTemplate.delete({ where: { id } });
    return { deleted: true, id };
  }

  async cloneTemplateToProduct(adminId: string, templateId: string, categoryId: string) {
    await this.ensureCategoryOwned(adminId, categoryId);
    const template = await this.prisma.productTemplate.findFirst({
      where: { id: templateId, adminId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.profileId) throw new BadRequestException('Template has no provisioning profile');

    const product = await this.prisma.storeProduct.create({
      data: {
        adminId,
        categoryId,
        profileId: template.profileId,
        templateId: template.id,
        name: template.name,
        description: template.description,
        priceToman: template.priceToman,
        priceUsd: template.priceUsd,
        traffic: template.traffic,
        durationDays: template.durationDays,
      },
    });
    return this.serializeProduct(product);
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(adminId: string) {
    const items = await this.prisma.storeProduct.findMany({
      where: { adminId, NOT: { status: 'archived' } },
      include: {
        category: true,
        profile: { include: { panel: { select: { id: true, name: true } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency || 'USD';
    return Promise.all(items.map((p) => this.enrichProductIpOptions(adminId, p, currency)));
  }

  async createProduct(adminId: string, data: Record<string, unknown>) {
    const isTest = data.isTest === true;
    const categoryId = isTest
      ? (data.categoryId as string) || null
      : (data.categoryId as string);
    if (!isTest && !categoryId) {
      throw new BadRequestException('Category is required');
    }
    await this.ensureCategoryOwned(adminId, categoryId);
    await this.ensureProfileOwned(adminId, data.profileId as string);
    await this.assertPluginProfileUsable(adminId, data.profileId as string);
    const ipLimitIds = this.normalizeIpLimitIds(data.ipLimitIds);
    if (ipLimitIds.length) {
      const count = await this.countAddonsByIds(adminId, ipLimitIds);
      if (count !== ipLimitIds.length) {
        throw new BadRequestException('Invalid IP limit selection');
      }
    }
    const product = await this.prisma.storeProduct.create({
      data: {
        adminId,
        categoryId,
        profileId: data.profileId as string,
        templateId: (data.templateId as string) || null,
        name: data.name as string,
        description: (data.description as string) || null,
        priceToman: data.priceToman != null ? Number(data.priceToman) : null,
        priceUsd: Number(data.priceUsd ?? 0),
        traffic: BigInt(data.traffic as string | number || 0),
        durationDays: Number(data.durationDays ?? 30),
        status: (data.status as string) || 'active',
        badge: (data.badge as string) || null,
        sortOrder: Number(data.sortOrder ?? 0),
        featured: data.featured === true,
        visible: data.visible !== false,
        renewable: isTest ? false : data.renewable !== false,
        maxQuantity: Number(data.maxQuantity ?? 1),
        isTest,
        testCooldownoldownDays: Math.max(
          1,
          Number(data.testCooldownoldownDays ?? data.testCooldownDays ?? 30),
        ),
        ipLimitIds,
        ipLimitOptions: [],
      },
    });
    if (data.baseLimitIp != null) {
      await this.writeBaseLimitIp(product.id, Number(data.baseLimitIp));
    }
    return this.enrichProductIpOptions(adminId, product);
  }

  async updateProduct(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Product not found');
    if (data.categoryId !== undefined) {
      await this.ensureCategoryOwned(adminId, data.categoryId as string | null);
    }
    if (data.profileId) {
      await this.ensureProfileOwned(adminId, data.profileId as string);
      const existingProfile = await this.prisma.provisioningProfile.findFirst({
        where: { id: existing.profileId, adminId },
        select: { providerId: true },
      });
      const nextProfile = await this.prisma.provisioningProfile.findFirst({
        where: { id: data.profileId as string, adminId },
        select: { providerId: true },
      });
      const from = existingProfile?.providerId || PANEL_3XUI_PROVIDER;
      const to = nextProfile?.providerId || PANEL_3XUI_PROVIDER;
      if (from !== to) {
        throw new BadRequestException('Cannot switch a product between 3x-ui and Eylan profiles');
      }
      await this.assertPluginProfileUsable(adminId, data.profileId as string);
    }
    let ipLimitIds: string[] | undefined;
    if (data.ipLimitIds !== undefined) {
      ipLimitIds = this.normalizeIpLimitIds(data.ipLimitIds);
      if (ipLimitIds.length) {
        const count = await this.countAddonsByIds(adminId, ipLimitIds);
        if (count !== ipLimitIds.length) {
          throw new BadRequestException('Invalid IP limit selection');
        }
      }
    }
    await this.prisma.storeProduct.update({
      where: { id },
      data: {
        categoryId:
          data.categoryId !== undefined
            ? ((data.categoryId as string) || null)
            : undefined,
        profileId: data.profileId as string | undefined,
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        priceToman:
          data.priceToman === undefined
            ? undefined
            : data.priceToman == null || data.priceToman === ''
              ? null
              : Number(data.priceToman),
        priceUsd: data.priceUsd != null ? Number(data.priceUsd) : undefined,
        traffic: data.traffic != null ? BigInt(data.traffic as string | number) : undefined,
        durationDays: data.durationDays != null ? Number(data.durationDays) : undefined,
        status: data.status as string | undefined,
        badge: data.badge as string | undefined,
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : undefined,
        featured: data.featured as boolean | undefined,
        visible: data.visible as boolean | undefined,
        renewable: data.renewable as boolean | undefined,
        maxQuantity: data.maxQuantity != null ? Number(data.maxQuantity) : undefined,
        isTest: data.isTest !== undefined ? data.isTest === true : undefined,
        testCooldownoldownDays:
          data.testCooldownoldownDays != null || data.testCooldownDays != null
            ? Math.max(1, Number(data.testCooldownoldownDays ?? data.testCooldownDays))
            : undefined,
        ipLimitIds: ipLimitIds !== undefined ? ipLimitIds : undefined,
      },
    });
    if (data.baseLimitIp != null) {
      await this.writeBaseLimitIp(id, Number(data.baseLimitIp));
    }
    const product = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    if (product?.isTest && product.categoryId) {
      await this.backfillTestProductCategoryOnCustomers(adminId, id, product.categoryId);
    }
    return product ? this.enrichProductIpOptions(adminId, product) : null;
  }

  async reorderProducts(adminId: string, ids: string[]) {
    const unique = this.normalizeReorderIds(ids);
    if (!unique.length) throw new BadRequestException('ids required');
    const owned = await this.prisma.storeProduct.findMany({
      where: { adminId, id: { in: unique }, NOT: { status: 'archived' } },
      select: { id: true },
    });
    if (owned.length !== unique.length) throw new BadRequestException('Invalid product ids');
    await this.prisma.$transaction(
      unique.map((id, index) =>
        this.prisma.storeProduct.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  // ── Product Addons catalog (backward-compatible with ip-limits routes) ───

  async listIpLimits(adminId: string) {
    const rows = await this.listRawAddonsByAdmin(adminId);
    return rows.map((row) => this.normalizeAddonRow(row));
  }

  async upsertIpLimit(
    adminId: string,
    body: {
      id?: string;
      type?: 'IP_LIMIT' | 'EXTRA_DAYS' | string;
      limitIp?: number;
      days?: number;
      label?: string;
      priceExtraUsd?: number;
      priceExtraToman?: number;
      sortOrder?: number;
      enabled?: boolean;
    },
  ) {
    const type = this.normalizeAddonType(body.type);
    const limitIp = Math.max(0, Math.floor(Number(body.limitIp || 0)));
    const days = Math.max(0, Math.floor(Number(body.days || 0)));
    if (type === 'IP_LIMIT' && !(limitIp > 0)) {
      throw new BadRequestException('limitIp must be >= 1 for IP addons');
    }
    if (type === 'EXTRA_DAYS' && !(days > 0)) {
      throw new BadRequestException('days must be >= 1 for time addons');
    }
    const label =
      String(body.label || '').trim() ||
      (type === 'EXTRA_DAYS'
        ? `+${days} days`
        : limitIp === 1
          ? '+1 user'
          : `+${limitIp} users`);
    const data = {
      type,
      days: type === 'EXTRA_DAYS' ? days : 0,
      limitIp: type === 'IP_LIMIT' ? limitIp : 0,
      label,
      priceExtraUsd: Math.max(0, Number(body.priceExtraUsd || 0)),
      priceExtraToman: Math.max(0, Number(body.priceExtraToman || 0)),
      sortOrder: Number(body.sortOrder ?? 0),
      enabled: body.enabled !== false,
    };
    if (body.id) {
      const rows = await this.listRawAddonsByAdmin(adminId);
      const existing = rows.find((r) => String(r?.id || '') === body.id);
      if (!existing) throw new NotFoundException('Addon not found');
      await this.prisma.$executeRawUnsafe(
        `UPDATE "StoreIpLimit"
         SET "type"=$1,"days"=$2,"limitIp"=$3,"label"=$4,"priceExtraUsd"=$5,"priceExtraToman"=$6,"sortOrder"=$7,"enabled"=$8
         WHERE "id"=$9`,
        data.type,
        data.days,
        data.limitIp,
        data.label,
        data.priceExtraUsd,
        data.priceExtraToman,
        data.sortOrder,
        data.enabled,
        body.id,
      );
      const next = (await this.listRawAddonsByAdmin(adminId)).find((r) => String(r?.id || '') === body.id);
      return this.normalizeAddonRow(next || { id: body.id, ...data });
    }
    const id = randomUUID();
    const now = new Date();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "StoreIpLimit"
        ("id","adminId","type","days","limitIp","label","priceExtraUsd","priceExtraToman","sortOrder","enabled","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      id,
      adminId,
      data.type,
      data.days,
      data.limitIp,
      data.label,
      data.priceExtraUsd,
      data.priceExtraToman,
      data.sortOrder,
      data.enabled,
      now,
      now,
    );
    return this.normalizeAddonRow({ id, adminId, ...data });
  }

  async deleteIpLimit(adminId: string, id: string) {
    const rows = await this.listRawAddonsByAdmin(adminId);
    const existing = rows.find((r) => String(r?.id || '') === id);
    if (!existing) throw new NotFoundException('Addon not found');
    await this.prisma.storeIpLimit.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * One-shot: migrate legacy product.ipLimitOptions into add-on rows + ipLimitIds.
   */
  async migrateLegacyIpOptions(adminId: string) {
    const products = await this.prisma.storeProduct.findMany({
      where: { adminId },
      select: { id: true, ipLimitOptions: true, ipLimitIds: true },
    });
    let migrated = 0;
    for (const product of products) {
      const existingIds = this.normalizeIpLimitIds(product.ipLimitIds);
      if (existingIds.length) continue;
      const legacy = this.normalizeLegacyIpLimitOptions(product.ipLimitOptions);
      if (!legacy.length) continue;
      const ids: string[] = [];
      for (const opt of legacy) {
        const row = await this.prisma.storeIpLimit.upsert({
          where: { adminId_limitIp: { adminId, limitIp: opt.limitIp } },
          create: {
            adminId,
            limitIp: opt.limitIp,
            label: opt.label,
            priceExtraUsd: Number(opt.priceExtraUsd ?? opt.priceExtra),
            priceExtraToman: Number(opt.priceExtraToman ?? opt.priceExtra),
          },
          update: {},
        });
        await this.prisma.$executeRawUnsafe(
          `UPDATE "StoreIpLimit" SET "type"='IP_LIMIT',"days"=0 WHERE "id"=$1`,
          row.id,
        );
        ids.push(row.id);
      }
      await this.prisma.storeProduct.update({
        where: { id: product.id },
        data: { ipLimitIds: ids },
      });
      migrated += 1;
    }
    return { migrated };
  }

  async deleteProduct(adminId: string, id: string) {
    const existing = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Product not found');
    const orderCount = await this.prisma.storeOrder.count({ where: { productId: id } });
    if (orderCount > 0 || existing.status === 'archived') {
      await this.prisma.storeProduct.update({
        where: { id },
        data: { status: 'archived', visible: false },
      });
      return { deleted: true, id, soft: true };
    }
    try {
      await this.prisma.storeProduct.delete({ where: { id } });
    } catch (err: any) {
      // FK from orders / other relations → soft archive instead of 500.
      if (err?.code === 'P2003') {
        await this.prisma.storeProduct.update({
          where: { id },
          data: { status: 'archived', visible: false },
        });
        return { deleted: true, id, soft: true };
      }
      throw err;
    }
    return { deleted: true, id };
  }

  // ── Orders (Admin) ─────────────────────────────────────────────────────────

  async listOrders(adminId: string, status?: string) {
    const store = await this.getOrCreateProfile(adminId);
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        storeId: store.id,
        ...(status ? { status: status as StoreOrderStatus } : {}),
      },
      include: {
        product: { include: { category: true } },
        customer: true,
        payment: true,
        client: {
          select: { id: true, email: true, remark: true, subId: true, subToken: true },
        },
        renewClient: {
          select: { id: true, email: true, remark: true, subId: true, subToken: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = orders.map((o) => ({
      ...o,
      // Prefer live server config name for renewals (and backfill placeholder "renewal")
      configName: this.resolveOrderConfigName(o),
      product: o.product ? this.serializeProduct(o.product) : o.product,
    }));
    return this.attachOrderDelivery(adminId, mapped);
  }

  /** Server-side config label for admin UI / Telegram (email on panel is the real name). */
  private resolveOrderConfigName(order: {
    configName?: string | null;
    isRenewal?: boolean | null;
    client?: { email?: string | null; remark?: string | null } | null;
    renewClient?: { email?: string | null; remark?: string | null } | null;
  }): string | null {
    const fromRenew =
      order.renewClient?.email?.trim() || order.renewClient?.remark?.trim() || '';
    const fromClient = order.client?.email?.trim() || order.client?.remark?.trim() || '';
    const stored = String(order.configName || '').trim();
    if (order.isRenewal) {
      return fromRenew || fromClient || (stored && stored !== 'renewal' ? stored : null);
    }
    return fromClient || stored || null;
  }

  async getOrder(adminId: string, orderId: string) {
    const store = await this.getOrCreateProfile(adminId);
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, storeId: store.id },
      include: {
        product: { include: { category: true, profile: true } },
        customer: true,
        payment: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        client: true,
        renewClient: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const mapped = {
      ...order,
      configName: this.resolveOrderConfigName(order),
      product: order.product ? this.serializeProduct(order.product) : order.product,
    };
    const [withDelivery] = await this.attachOrderDelivery(adminId, [mapped]);
    return withDelivery;
  }

  private fulfillmentSubUrl(fulfillment: unknown): string | null {
    if (!fulfillment || typeof fulfillment !== 'object') return null;
    const url = String((fulfillment as { subUrl?: unknown }).subUrl || '').trim();
    return url || null;
  }

  private fulfillmentSubToken(fulfillment: unknown): string | null {
    if (!fulfillment || typeof fulfillment !== 'object') return null;
    const token = String((fulfillment as { subToken?: unknown }).subToken || '').trim();
    return token || null;
  }

  private async attachOrderDelivery<
    T extends {
      configName?: string | null;
      fulfillment?: unknown;
      client?: { subId?: string | null; subToken?: string | null } | null;
      renewClient?: { subId?: string | null; subToken?: string | null } | null;
    },
  >(adminId: string, orders: T[]): Promise<Array<T & { deliveryUrl: string | null }>> {
    const missingEmails = [
      ...new Set(
        orders
          .filter((o) => {
            const url = this.fulfillmentSubUrl(o.fulfillment);
            if (url && (/^https?:\/\//i.test(url) || url.startsWith('/s/'))) return false;
            return !(
              o.client?.subId ||
              o.client?.subToken ||
              o.renewClient?.subId ||
              o.renewClient?.subToken ||
              this.fulfillmentSubToken(o.fulfillment)
            );
          })
          .map((o) => String(o.configName || '').trim())
          .filter((name) => name && name !== 'renewal'),
      ),
    ];
    const byEmail = new Map<string, { subId: string | null; subToken: string | null }>();
    if (missingEmails.length) {
      try {
        const found = await this.prisma.client.findMany({
          where: { adminId, email: { in: missingEmails } },
          select: { email: true, subId: true, subToken: true },
        });
        for (const row of found) byEmail.set(row.email, row);
      } catch (err: any) {
        this.logger.warn(`Order delivery lookup skipped: ${err?.message || err}`);
      }
    }
    const out: Array<T & { deliveryUrl: string | null }> = [];
    for (const order of orders) {
      const ffUrl = this.fulfillmentSubUrl(order.fulfillment);
      let deliveryUrl: string | null = null;
      if (ffUrl && /^https?:\/\//i.test(ffUrl)) deliveryUrl = ffUrl;
      else if (ffUrl && ffUrl.startsWith('/s/')) {
        deliveryUrl = (await this.buildSystemSubUrl(adminId, ffUrl.slice(3))) || ffUrl;
      } else {
        const lookup = byEmail.get(String(order.configName || '').trim());
        const token =
          order.client?.subId ||
          order.client?.subToken ||
          order.renewClient?.subId ||
          order.renewClient?.subToken ||
          this.fulfillmentSubToken(order.fulfillment) ||
          lookup?.subId ||
          lookup?.subToken ||
          null;
        if (token) {
          deliveryUrl = /^https?:\/\//i.test(token)
            ? token
            : token.startsWith('/s/')
              ? (await this.buildSystemSubUrl(adminId, token.slice(3))) || token
              : (await this.buildSystemSubUrl(adminId, token)) || `/s/${encodeURIComponent(token)}`;
        }
      }
      out.push({ ...order, deliveryUrl });
    }
    return out;
  }

  private async addTimeline(
    orderId: string,
    status: string,
    message?: string,
    actor?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.orderTimelineEvent.create({
      data: { orderId, status, message, actor, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  }

  private provisionFailureMessage(err: unknown): string {
    const e = err as {
      getResponse?: () => unknown;
      message?: string;
      response?: { message?: unknown };
    };
    if (typeof e?.getResponse === 'function') {
      const r = e.getResponse();
      if (typeof r === 'string' && r.trim()) return r.slice(0, 500);
      if (r && typeof r === 'object') {
        const m = (r as { message?: unknown }).message;
        if (Array.isArray(m)) return m.map(String).join(', ').slice(0, 500);
        if (typeof m === 'string' && m.trim()) return m.slice(0, 500);
      }
    }
    if (e?.message && e.message !== 'Bad Request') return String(e.message).slice(0, 500);
    if (e?.response?.message != null) return String(e.response.message).slice(0, 500);
    return 'Provisioning failed';
  }

  private asProvisionHttpError(err: unknown): HttpException {
    if (err instanceof HttpException) return err;
    return new BadRequestException(this.provisionFailureMessage(err));
  }

  private async recordProvisionFailure(
    order: { id: string; customerId: string; trackingCode: string; configName?: string | null },
    err: unknown,
  ) {
    const message = this.provisionFailureMessage(err);
    try {
      await this.prisma.storeOrder.update({
        where: { id: order.id },
        data: { status: 'PROVISION_FAILED', provisionError: message },
      });
      await this.addTimeline(order.id, 'PROVISION_FAILED', message, 'system');
    } catch (persistErr: any) {
      this.logger.error(
        `Could not persist provision failure for ${order.id}: ${persistErr?.message || persistErr}`,
      );
    }
    // Do not notify customers on backend auto-provision failures.
    // Admin may retry or manually deliver; customer should only see finalized outcome.
  }

  async manualDeliverOrder(
    adminId: string,
    role: string,
    orderId: string,
    body: {
      configName?: string | null;
      subUrl?: string | null;
      note?: string | null;
    },
  ) {
    const order = await this.getOrder(adminId, orderId);
    if (order.status === 'ACTIVE' || order.status === 'RENEWED') {
      return order;
    }
    if (
      !['APPROVED', 'PROVISION_FAILED', 'PROVISIONING', 'UNDER_REVIEW', 'PAYMENT_SUBMITTED'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Order cannot be manually delivered in current status');
    }

    const nextConfig =
      String(body?.configName || '').trim() ||
      String(order.configName || '').trim() ||
      'manual-service';
    const nextSubUrl = String(body?.subUrl || '').trim() || null;
    const note = String(body?.note || '').trim() || 'Manual delivery by admin';
    const finalStatus = order.isRenewal ? 'RENEWED' : 'ACTIVE';
    const providerId =
      parseFulfillment(order.fulfillment)?.providerId ||
      order.product?.profile?.providerId ||
      'manual';

    await this.prisma.storeOrder.update({
      where: { id: orderId },
      data: {
        status: finalStatus,
        configName: nextConfig,
        provisionError: null,
        pendingReview: false,
        autoDeliverAt: null,
        fulfillment: {
          providerId,
          username: nextConfig,
          configName: nextConfig,
          subUrl: nextSubUrl || undefined,
        } as Prisma.InputJsonValue,
      },
    });
    await this.addTimeline(orderId, finalStatus, note, 'admin');
    await this.finalizeProvisionSuccess({
      orderId,
      customerId: order.customerId,
      trackingCode: order.trackingCode,
      isRenewal: !!order.isRenewal,
      isTest: !!order.isTest,
      configName: nextConfig,
      renewClientId: order.renewClientId,
      productCategoryId: order.product?.categoryId || null,
    });
    return this.getOrder(adminId, orderId);
  }

  async updateOrder(
    adminId: string,
    role: string,
    orderId: string,
    body: {
      status?: string;
      configName?: string;
      subUrl?: string;
      note?: string;
      deliver?: boolean;
    },
  ) {
    if (body.deliver || String(body.subUrl || '').trim()) {
      return this.manualDeliverOrder(adminId, role, orderId, {
        configName: body.configName,
        subUrl: body.subUrl,
        note: body.note,
      });
    }

    const order = await this.getOrder(adminId, orderId);
    const nextStatus = String(body.status || '').trim().toUpperCase();
    if (nextStatus && nextStatus !== order.status) {
      const allowed: StoreOrderStatus[] = [
        'PENDING_PAYMENT',
        'PAYMENT_SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'PROVISIONING',
        'PROVISION_FAILED',
        'ACTIVE',
        'RENEWED',
        'REJECTED',
        'CANCELLED',
        'EXPIRED',
      ];
      if (!allowed.includes(nextStatus as StoreOrderStatus)) {
        throw new BadRequestException('Invalid order status');
      }
      const terminal: StoreOrderStatus[] = ['CANCELLED', 'REJECTED', 'EXPIRED'];
      const settled: StoreOrderStatus[] = ['ACTIVE', 'RENEWED', ...terminal];
      // Always apply when a status is sent — including same status — so sticky
      // pendingReview can be cleared without flipping ACTIVE↔RENEWED.
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          ...(nextStatus !== order.status
            ? { status: nextStatus as StoreOrderStatus }
            : {}),
          ...(settled.includes(nextStatus as StoreOrderStatus)
            ? { pendingReview: false, autoDeliverAt: null }
            : {}),
        },
      });
      if (nextStatus !== order.status || order.pendingReview) {
        await this.addTimeline(
          orderId,
          nextStatus as StoreOrderStatus,
          body.note ||
            (nextStatus !== order.status
              ? `Status set to ${nextStatus}`
              : 'Cleared pending review'),
          'admin',
        );
      }
    }

    if (body.configName && String(body.configName).trim()) {
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: { configName: String(body.configName).trim() },
      });
    }

    return this.getOrder(adminId, orderId);
  }

  private async finalizeProvisionSuccess(input: {
    orderId: string;
    customerId: string;
    trackingCode: string;
    isRenewal: boolean;
    isTest?: boolean | null;
    configName?: string | null;
    renewClientId?: string | null;
    productCategoryId?: string | null;
    autoDelivered?: boolean;
  }) {
    try {
      const ready = await this.prisma.storeOrder.findUnique({
        where: { id: input.orderId },
        include: {
          client: { select: { subId: true, remark: true, email: true } },
          product: { select: { name: true, categoryId: true, isTest: true } },
          store: { select: { adminId: true } },
        },
      });
      const linkedClientId = ready?.clientId || input.renewClientId || null;
      if (linkedClientId) {
        await this.linkClientToCustomer(
          input.customerId,
          linkedClientId,
          ready?.product?.categoryId || input.productCategoryId || null,
        );
      } else if (ready) {
        const ff = parseFulfillment((ready as { fulfillment?: unknown }).fulfillment);
        if (isEylanProvider(ff?.providerId)) {
          await this.linkEylanOrderToCustomer(
            input.customerId,
            ready.id,
            ready.product?.categoryId || input.productCategoryId || null,
          );
        } else if (isPasarguardProvider(ff?.providerId)) {
          await this.linkPasarguardOrderToCustomer(
            input.customerId,
            ready.id,
            ready.product?.categoryId || input.productCategoryId || null,
          );
        }
      }
      const ffReady = parseFulfillment((ready as { fulfillment?: unknown }).fulfillment);
      const productName = ready?.product?.name || input.configName;
      const serviceName =
        ready?.client?.remark || ready?.client?.email || productName || input.configName;
      const finalStatus = input.isRenewal ? 'RENEWED' : 'ACTIVE';
      const isTest = !!input.isTest || !!(ready as { product?: { isTest?: boolean } } | null)?.product?.isTest;
      await this.customerNotifications.notifyCustomer(input.customerId, {
        type: isTest ? 'test_created' : 'subscription_updated',
        title: isTest
          ? 'اکانت تست ساخته شد / Test account created'
          : input.isRenewal
            ? '🎉 تمدید انجام شد / Renewal complete'
            : '🎉 سرویس آماده است / Service ready',
        message: isTest
          ? ''
          : input.isRenewal
            ? 'تمدید با موفقیت انجام شد. / Your renewal is active.'
            : 'خرید شما فعال شد. / Your purchase is now active.',
        payload: {
          orderId: input.orderId,
          trackingCode: isTest ? undefined : input.trackingCode,
          status: finalStatus,
          subId: isTest ? undefined : ready?.client?.subId || undefined,
          subUrl: isTest ? undefined : ffReady?.subUrl || undefined,
          providerId: ffReady?.providerId || undefined,
          configName: input.configName || ready?.client?.remark || ready?.client?.email,
          serviceName: isTest ? productName : serviceName,
          kind: isTest ? 'test_created' : 'service_ready',
          isTest,
          isRenewal: input.isRenewal,
          ...(input.autoDelivered ? { autoDelivered: true } : {}),
        },
        orderId: input.orderId,
      });
      if (ready?.store?.adminId) {
        void this.telegram
          .syncAdminOrderTelegram(
            ready.store.adminId,
            input.orderId,
            input.autoDelivered
              ? '⚡️ <b>تحویل خودکار انجام شد</b> — تأیید نهایی یا رد کنید.'
              : '✅ <b>سرویس ساخته شد.</b>',
            { keepActions: !!input.autoDelivered },
          )
          .catch((err) =>
            this.logger.warn(
              `Admin Telegram sync after provision failed: ${err?.message || err}`,
            ),
          );
      }
      if (!input.isTest) {
        void this.referralRewards.evaluateForCustomer(input.customerId, 'purchase');
      }
    } catch (err: any) {
      this.logger.warn(
        `Post-provision finalize failed for ${input.trackingCode}: ${err?.message || err}`,
      );
    }
  }

  async approveOrder(adminId: string, role: string, orderId: string) {
    const order = await this.getOrder(adminId, orderId);

    // Service already live (auto-deliver or sticky pendingReview after status edits).
    // Do not require autoDelivered — otherwise Telegram/web confirm throws
    // "Order cannot be approved in current status" while the badge stays on.
    if (order.pendingReview && ['ACTIVE', 'RENEWED'].includes(order.status)) {
      await this.prisma.$transaction(async (tx) => {
        await tx.storeOrder.update({
          where: { id: orderId },
          data: { pendingReview: false, autoDeliverAt: null },
        });
        await tx.storePayment.updateMany({
          where: { orderId, status: { not: 'REJECTED' } },
          data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: adminId },
        });
        await tx.orderTimelineEvent.create({
          data: {
            orderId,
            status: 'CONFIRMED',
            message: order.autoDelivered
              ? 'Admin confirmed auto-delivered order'
              : 'Admin cleared pending review on live order',
            actor: 'admin',
          },
        });
      });
      return this.getOrder(adminId, orderId);
    }

    if (
      !['PAYMENT_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PROVISION_FAILED', 'PROVISIONING'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Order cannot be approved in current status');
    }

    // If already payment-approved once, just retry provisioning
    if (['APPROVED', 'PROVISION_FAILED', 'PROVISIONING'].includes(order.status)) {
      return this.provisionOrder(adminId, role, orderId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: {
          status: 'APPROVED',
          provisionError: null,
          pendingReview: false,
          autoDeliverAt: null,
        },
      });
      await tx.storePayment.updateMany({
        where: { orderId },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: adminId },
      });
      await tx.orderTimelineEvent.create({
        data: { orderId, status: 'APPROVED', message: 'Payment approved', actor: 'admin' },
      });
    });

    await this.recordGatewayPayment('MANUAL_BANK', {
      amount: Number(order.amount || 0),
      currency: String(order.currency || 'USD'),
      orderId,
    }, 'verify');

    // Notify customer (in-app + Telegram) that payment was approved
    try {
      await this.customerNotifications.notifyCustomer(order.customerId, {
        type: 'order_approved',
        title: '✅ سفارش تأیید شد / Order approved',
        message: 'پرداخت تأیید شد؛ در حال ساخت سرویس… / Payment approved — creating your service…',
        payload: {
          orderId,
          trackingCode: order.trackingCode,
          status: 'APPROVED',
          configName: order.configName,
          kind: 'payment_approved',
          isRenewal: !!order.isRenewal,
        },
        orderId,
      });
    } catch (err: any) {
      this.logger.warn(
        `Customer notify after approve failed for ${order.trackingCode}: ${err?.message || err}`,
      );
    }

    void this.telegram
      .syncAdminOrderTelegram(adminId, orderId, '✅ <b>سفارش تأیید و در صف ساخت سرویس قرار گرفت.</b>')
      .catch((err) =>
        this.logger.warn(`Admin Telegram sync after approve failed: ${err?.message || err}`),
      );

    return this.provisionOrder(adminId, role, orderId);
  }

  async provisionOrder(adminId: string, role: string, orderId: string) {
    const order = await this.getOrder(adminId, orderId);
    if (order.status === 'ACTIVE' || order.status === 'RENEWED') {
      return order;
    }

    // Allow retry from failed/stuck provisioning states
    if (
      !['APPROVED', 'PROVISIONING', 'PROVISION_FAILED', 'PAYMENT_SUBMITTED', 'UNDER_REVIEW'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Order cannot be provisioned in current status');
    }

    await this.prisma.storeOrder.update({
      where: { id: orderId },
      data: { status: 'PROVISIONING', provisionError: null },
    });
    await this.addTimeline(orderId, 'PROVISIONING', 'Creating service', 'system');

    try {
      await this.provisioning.provisionOrder(orderId, adminId, role);
      const finalStatus = order.isRenewal ? 'RENEWED' : 'ACTIVE';
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: { status: finalStatus, provisionError: null },
      });
      await this.addTimeline(orderId, finalStatus, 'Service ready', 'system');
      await this.finalizeProvisionSuccess({
        orderId,
        customerId: order.customerId,
        trackingCode: order.trackingCode,
        isRenewal: !!order.isRenewal,
        isTest: !!order.isTest,
        configName: order.configName,
        renewClientId: order.renewClientId,
        productCategoryId: order.product?.categoryId || null,
      });
    } catch (err: unknown) {
      await this.recordProvisionFailure(order, err);
      throw this.asProvisionHttpError(err);
    }

    return this.getOrder(adminId, orderId);
  }

  async rejectOrder(adminId: string, orderId: string, reason?: string) {
    const order = await this.getOrder(adminId, orderId);

    // If auto-delivered (or already provisioned while tagged), reverse the delivery first
    if (
      order.autoDelivered &&
      (order.pendingReview || ['ACTIVE', 'RENEWED'].includes(order.status))
    ) {
      await this.reverseAutoDeliveredOrder(adminId, 'ADMIN', order);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED',
          rejectReason: reason || null,
          pendingReview: false,
          autoDeliverAt: null,
        },
      });
      await tx.storePayment.updateMany({
        where: { orderId },
        data: { status: 'REJECTED', rejectReason: reason || null, reviewedAt: new Date(), reviewedBy: adminId },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'REJECTED',
          message: reason || 'Payment rejected',
          actor: 'admin',
        },
      });
    });
    const wasAutoDelivered = !!order.autoDelivered;
    await this.customerNotifications.notifyCustomer(order.customerId, {
      type: 'payment_rejected',
      title: wasAutoDelivered
        ? '🚫 سفارش توسط ادمین لغو شد / Order cancelled by admin'
        : '❌ سفارش رد شد / Order rejected',
      message: wasAutoDelivered
        ? reason ||
          'سفارش شما توسط ادمین لغو شد. برای پیگیری با پشتیبانی تماس بگیرید. / Your order was cancelled by the admin. Please contact support.'
        : reason ||
          'پرداخت رد شد. با پشتیبانی تماس بگیرید یا با رسید جدید دوباره تلاش کنید. / Your payment was rejected. Contact support or retry with a new receipt.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'REJECTED',
        configName: order.configName,
        kind: wasAutoDelivered ? 'order_cancelled_by_admin' : 'payment_rejected',
        reason: reason || null,
        includeSupport: true,
      },
      orderId,
    });
    void this.telegram
      .syncAdminOrderTelegram(
        adminId,
        orderId,
        wasAutoDelivered
          ? '↩️ <b>سفارش رد شد و تحویل خودکار برگشت داده شد.</b>'
          : '❌ <b>سفارش رد شد.</b>',
      )
      .catch((err) =>
        this.logger.warn(`Admin Telegram sync after reject failed: ${err?.message || err}`),
      );
    return this.getOrder(adminId, orderId);
  }

  async autoDeliverOrder(adminId: string, orderId: string) {
    const order = await this.getOrder(adminId, orderId);
    if (order.autoDelivered) return order;
    if (!['PAYMENT_SUBMITTED', 'UNDER_REVIEW'].includes(order.status)) {
      throw new BadRequestException('Order cannot be auto-delivered in current status');
    }

    // Snapshot renewal client before mutating traffic/expiry
    if (order.isRenewal && order.renewClientId) {
      const existing = await this.provisioning.resolveRenewClient(adminId, order.renewClientId);
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          renewSnapshot: {
            total: existing.total.toString(),
            expiryTime: existing.expiryTime.toString(),
            enable: existing.enable,
            up: existing.up?.toString?.() ?? String(existing.up ?? 0),
            down: existing.down?.toString?.() ?? String(existing.down ?? 0),
          },
        },
      });
    }

    await this.prisma.storeOrder.update({
      where: { id: orderId },
      data: { status: 'PROVISIONING', provisionError: null },
    });
    await this.addTimeline(orderId, 'PROVISIONING', 'Auto-deliver: creating service', 'system');

    try {
      await this.provisioning.provisionOrder(orderId, adminId, 'ADMIN');
      const finalStatus = order.isRenewal ? 'RENEWED' : 'ACTIVE';
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          status: finalStatus,
          provisionError: null,
          autoDelivered: true,
          pendingReview: true,
          autoDeliverAt: null,
        },
      });
      await this.addTimeline(
        orderId,
        'AUTO_DELIVERED',
        'Auto-delivered — awaiting admin confirm',
        'system',
      );

      // Mark payment reviewed as submitted→approved pending final confirm
      await this.prisma.storePayment.updateMany({
        where: { orderId },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: 'system:auto-deliver' },
      });

      await this.finalizeProvisionSuccess({
        orderId,
        customerId: order.customerId,
        trackingCode: order.trackingCode,
        isRenewal: !!order.isRenewal,
        isTest: !!order.isTest,
        configName: order.configName,
        renewClientId: order.renewClientId,
        productCategoryId: order.product?.categoryId || null,
        autoDelivered: true,
      });
    } catch (err: unknown) {
      const message = this.provisionFailureMessage(err);
      try {
        await this.prisma.storeOrder.update({
          where: { id: orderId },
          data: {
            status: 'PROVISION_FAILED',
            provisionError: message,
            autoDeliverAt: null,
            pendingReview: true,
          },
        });
        await this.addTimeline(orderId, 'PROVISION_FAILED', message, 'system');
      } catch (persistErr: any) {
        this.logger.error(
          `Could not persist auto-deliver failure for ${orderId}: ${persistErr?.message || persistErr}`,
        );
      }
      throw this.asProvisionHttpError(err);
    }

    return this.getOrder(adminId, orderId);
  }

  private async reverseAutoDeliveredOrder(
    adminId: string,
    role: string,
    order: {
      id: string;
      isRenewal?: boolean | null;
      renewClientId?: string | null;
      clientId?: string | null;
      renewSnapshot?: unknown;
      trackingCode?: string;
    },
  ) {
    try {
      const ff = parseFulfillment((order as { fulfillment?: unknown }).fulfillment);
      if (isEylanProvider(ff?.providerId)) {
        await this.addTimeline(order.id, 'REVERSED', 'Eylan auto-deliver marked reversed (remote user kept)', 'system');
        return;
      }
      if (order.isRenewal && order.renewClientId && order.renewSnapshot) {
        const snap = order.renewSnapshot as {
          total?: string | number;
          expiryTime?: string | number;
          enable?: boolean;
        };
        await this.clientsService.update(order.renewClientId, adminId, role, {
          total: Number(snap.total ?? 0),
          expiryTime: Number(snap.expiryTime ?? 0),
          enable: snap.enable !== false,
        });
        await this.addTimeline(
          order.id,
          'REVERSED',
          'Auto-deliver renewal reversed to previous traffic/expiry',
          'system',
        );
        this.logger.log(`Reversed renewal for order ${order.trackingCode}`);
        return;
      }

      const clientId = order.clientId || null;
      if (clientId) {
        await this.clientsService.remove(clientId, adminId, role, true);
        await this.prisma.storeOrder.update({
          where: { id: order.id },
          data: { clientId: null },
        });
        await this.addTimeline(
          order.id,
          'REVERSED',
          'Auto-delivered config deleted after reject',
          'system',
        );
        this.logger.log(`Deleted auto-delivered client ${clientId} for order ${order.trackingCode}`);
      }
    } catch (err: any) {
      this.logger.warn(
        `reverseAutoDeliveredOrder failed for ${order.trackingCode}: ${err?.message || err}`,
      );
      throw new BadRequestException(
        `Could not reverse delivery: ${err?.message || 'unknown error'}`,
      );
    }
  }

  private static readonly ADMIN_CANCELABLE = new Set([
    'PENDING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PROVISIONING',
    'PROVISION_FAILED',
  ]);

  private static readonly CUSTOMER_CANCELABLE = new Set([
    'PENDING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'UNDER_REVIEW',
  ]);

  async cancelOrder(adminId: string, orderId: string, reason?: string) {
    const order = await this.getOrder(adminId, orderId);
    if (!StoreService.ADMIN_CANCELABLE.has(order.status)) {
      throw new BadRequestException(`Cannot cancel order in status ${order.status}`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          rejectReason: reason || order.rejectReason || null,
          pendingReview: false,
          autoDeliverAt: null,
        },
      });
      // Reject any non-rejected payment so cancelled orders never look "paid" for revenue
      await tx.storePayment.updateMany({
        where: { orderId, status: { not: 'REJECTED' } },
        data: {
          status: 'REJECTED',
          rejectReason: reason || 'Order cancelled',
          reviewedAt: new Date(),
          reviewedBy: adminId,
        },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'CANCELLED',
          message: reason || 'Order cancelled by admin',
          actor: 'admin',
        },
      });
    });
    await this.customerNotifications.notifyCustomer(order.customerId, {
      type: 'order_cancelled',
      title: '🚫 سفارش لغو شد / Order cancelled',
      message: reason || 'این سفارش لغو شد. / This order was cancelled.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'CANCELLED',
        configName: order.configName,
        kind: 'order_cancelled',
      },
      orderId,
    });
    return this.getOrder(adminId, orderId);
  }

  async cancelOrderByCustomer(sessionToken: string, orderId: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, customerId: customer.id },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!StoreService.CUSTOMER_CANCELABLE.has(order.status)) {
      throw new BadRequestException('This order can no longer be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', pendingReview: false, autoDeliverAt: null },
      });
      await tx.storePayment.updateMany({
        where: { orderId, status: { not: 'REJECTED' } },
        data: {
          status: 'REJECTED',
          rejectReason: 'Cancelled by customer',
          reviewedAt: new Date(),
        },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'CANCELLED',
          message: 'Order cancelled by customer',
          actor: 'customer',
        },
      });
    });
    await this.customerNotifications.notifyCustomer(customer.id, {
      type: 'order_cancelled',
      title: '🚫 سفارش لغو شد / Order cancelled',
      message: 'شما این سفارش را لغو کردید. / You cancelled this order.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'CANCELLED',
        configName: order.configName,
        kind: 'order_cancelled',
      },
      orderId,
    });
    return this.buildCustomerDashboard(customer.token);
  }

  // ── Public Storefront ──────────────────────────────────────────────────────

  /**
   * Opaque per-store tracking codes: PREFIX-SEQUENCE (e.g. X7K2-1020).
   * Prefix stops URL enumeration on /track/:code; sequence stays human-friendly.
   * Call OUTSIDE `$transaction` (same reason as before).
   */
  private async allocateOrderNumber(
    db: PrismaService | Prisma.TransactionClient,
    storeId: string,
  ): Promise<string> {
    try {
      const counter = await db.storeProfile.update({
        where: { id: storeId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
      });
      return buildPrefixedTrackingCode(counter.nextOrderNumber - 1);
    } catch (err: any) {
      this.logger.warn(
        `nextOrderNumber unavailable (${err?.message || err}) — using fallback allocator`,
      );
    }

    // Fallback: next after highest existing numeric sequence for this store
    try {
      const rows = await db.storeOrder.findMany({
        where: { storeId },
        select: { trackingCode: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });
      let max = 999;
      for (const row of rows) {
        const n = parseTrackingSequence(row.trackingCode);
        if (n != null && n > max) max = n;
      }
      const candidate = buildPrefixedTrackingCode(max + 1);
      const clash = await db.storeOrder.findUnique({
        where: { trackingCode: candidate },
      });
      if (!clash) return candidate;
    } catch (err: any) {
      this.logger.warn(`numeric order fallback failed: ${err?.message || err}`);
    }

    let code = generateTrackingCode();
    while (await db.storeOrder.findUnique({ where: { trackingCode: code } })) {
      code = generateTrackingCode();
    }
    return code;
  }

  /**
   * Rewrite legacy sequential tracking codes ("1020") to "XXXX-1020" so
   * /track/1020 can no longer enumerate other customers' orders.
   */
  async remediateSequentialTrackingCodes(): Promise<number> {
    if (this.remediatingTrackingCodes) return 0;
    this.remediatingTrackingCodes = true;
    let updated = 0;
    try {
      const rows = await this.prisma.storeOrder.findMany({
        select: { id: true, trackingCode: true },
        take: 5000,
        orderBy: { createdAt: 'asc' },
      });
      const legacy = rows.filter((r) => /^\d+$/.test(String(r.trackingCode || '').trim()));
      if (!legacy.length) return 0;

      this.logger.log(
        `Remediating ${legacy.length} sequential tracking code(s) to PREFIX-SEQ format`,
      );

      for (const row of legacy) {
        const seq = String(row.trackingCode).trim();
        let next = '';
        for (let attempt = 0; attempt < 12; attempt++) {
          next = `${generateTrackingPrefix(4)}-${seq}`.toUpperCase();
          const clash = await this.prisma.storeOrder.findUnique({
            where: { trackingCode: next },
            select: { id: true },
          });
          if (!clash) break;
          next = '';
        }
        if (!next) {
          this.logger.warn(
            `Could not allocate opaque code for legacy tracking ${seq} (id=${row.id})`,
          );
          continue;
        }
        try {
          await this.prisma.storeOrder.update({
            where: { id: row.id },
            data: { trackingCode: next },
          });
          updated++;
        } catch (err: any) {
          this.logger.warn(
            `Failed rewriting tracking ${seq} → ${next}: ${err?.message || err}`,
          );
        }
      }

      if (updated > 0) {
        this.logger.log(`Rewrote ${updated} legacy tracking code(s)`);
      }
      return updated;
    } finally {
      this.remediatingTrackingCodes = false;
    }
  }

  private async buildPublicBranding(adminId: string) {
    const branding = await this.branding.getBranding(adminId);
    return {
      name: branding.name,
      logo: branding.logo,
      logoDark: branding.logoDark,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      footerText: branding.footerText,
      supportLinks: branding.supportLinks,
      theme: branding.theme,
    };
  }

  private serializeService(
    service: {
      id: string;
      email: string;
      remark: string | null;
      subId: string | null;
      subToken: string | null;
      enable: boolean;
      expiryTime: bigint;
      total: bigint;
      up: bigint;
      down: bigint;
    },
    categoryId: string | null = null,
  ) {
    const used = service.up + service.down;
    const expired = service.expiryTime > 0n && service.expiryTime <= BigInt(Date.now());
    const depleted = service.total > 0n && used >= service.total;
    const disabled = !service.enable;
    // Keep expired/depleted services visible so customers can renew.
    // Prefer time-expiry over disable flag (panel often disables expired configs).
    let status = 'active';
    if (expired) status = 'expired';
    else if (depleted) status = 'depleted';
    else if (disabled) status = 'disabled';

    return {
      ...service,
      categoryId,
      providerId: PANEL_3XUI_PROVIDER,
      subUrl: null as string | null,
      status,
      unused: !disabled && !expired && !depleted && used === 0n,
      total: service.total.toString(),
      up: service.up.toString(),
      down: service.down.toString(),
      expiryTime: service.expiryTime.toString(),
    };
  }

  private serializeEylanService(input: {
    id: string;
    username: string;
    subUrl?: string | null;
    categoryId?: string | null;
    productName?: string | null;
    trafficBytes?: number | null;
    durationDays?: number | null;
    usedBytes?: number | null;
    totalBytes?: number | null;
    expiryMs?: number | null;
  }) {
    const planTraffic = Number(input.trafficBytes || 0);
    const liveTotal = Number(input.totalBytes || 0);
    const total = liveTotal > 0 ? liveTotal : planTraffic;
    const used = Math.max(0, Number(input.usedBytes || 0));
    const expiryTime = String(input.expiryMs && input.expiryMs > 0 ? input.expiryMs : 0);
    const durationDays = Number(input.durationDays || 0);
    const planLabelParts: string[] = [];
    if (planTraffic > 0) {
      const gb = planTraffic / 1073741824;
      planLabelParts.push(gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(planTraffic / 1048576)} MB`);
    } else {
      planLabelParts.push('Unlimited');
    }
    if (durationDays > 0) {
      planLabelParts.push(durationDays === 30 ? '1 month' : `${durationDays} days`);
    } else {
      planLabelParts.push('No expiry');
    }
    return {
      id: input.id,
      email: input.username,
      remark: input.productName || input.username,
      subId: null,
      subToken: null,
      subUrl: input.subUrl || null,
      providerId: EYLAN_PROVIDER,
      enable: true,
      expiryTime,
      total: String(total),
      up: String(used),
      down: '0',
      categoryId: input.categoryId || null,
      status: 'active' as const,
      unused: used === 0,
      productName: input.productName || null,
      planLabel: planLabelParts.join(' · '),
      durationDays,
      deliveryHint: 'eylan_download',
    };
  }

  private serializePasarguardService(input: {
    id: string;
    username: string;
    subUrl?: string | null;
    categoryId?: string | null;
    productName?: string | null;
    trafficBytes?: number | null;
    durationDays?: number | null;
    usedBytes?: number | null;
    totalBytes?: number | null;
    expiryMs?: number | null;
  }) {
    const base = this.serializeEylanService(input);
    return {
      ...base,
      providerId: PASARGUARD_PROVIDER,
      deliveryHint: 'subscription',
    };
  }

  /** Newest fulfilled order wins — used to lock renewals to the service category. */
  private categoryIdByClientId(
    orders: Array<{
      id?: string;
      clientId: string | null;
      renewClientId: string | null;
      createdAt?: Date;
      fulfillment?: unknown;
      product: { categoryId: string; profile?: { providerId?: string | null } | null };
    }>,
    metadata?: unknown,
  ): Map<string, string> {
    const sorted = [...orders].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    const map = new Map<string, string>();
    for (const order of sorted) {
      const cat = order.product?.categoryId;
      if (!cat) continue;
      if (order.clientId && !map.has(order.clientId)) map.set(order.clientId, cat);
      if (order.renewClientId && !map.has(order.renewClientId)) {
        map.set(order.renewClientId, cat);
      }
      const eylan =
        isEylanProvider(parseFulfillment(order.fulfillment)?.providerId) ||
        isEylanProvider(order.product?.profile?.providerId);
      if (order.id && eylan) {
        const sid = eylanServiceId(order.id);
        if (!map.has(sid)) map.set(sid, cat);
      }
      const pasarguard =
        isPasarguardProvider(parseFulfillment(order.fulfillment)?.providerId) ||
        isPasarguardProvider(order.product?.profile?.providerId);
      if (order.id && pasarguard) {
        const sid = pasarguardServiceId(order.id);
        if (!map.has(sid)) map.set(sid, cat);
      }
    }
    // Claimed / manually assigned categories (fill gaps only)
    const claimed = this.getClientCategories(metadata);
    for (const [clientId, categoryId] of Object.entries(claimed)) {
      if (clientId && categoryId) map.set(clientId, categoryId);
    }
    return map;
  }

  private getClientCategories(metadata: unknown): Record<string, string> {
    const meta = (metadata || {}) as { clientCategories?: unknown };
    if (!meta.clientCategories || typeof meta.clientCategories !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta.clientCategories as Record<string, unknown>)) {
      if (typeof k === 'string' && k && typeof v === 'string' && v) out[k] = v;
    }
    return out;
  }

  private async setClientCategory(customerId: string, clientId: string, categoryId: string) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer) return;
    const meta = {
      ...((customer.metadata && typeof customer.metadata === 'object'
        ? customer.metadata
        : {}) as Record<string, unknown>),
    };
    const cats = this.getClientCategories(meta);
    if (cats[clientId] === categoryId) return;
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          clientCategories: { ...cats, [clientId]: categoryId },
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * When a test SKU gets (or changes) a category, stamp that category onto every
   * past buyer of this product so dashboard/bot renewals skip the category picker.
   */
  private async backfillTestProductCategoryOnCustomers(
    adminId: string,
    productId: string,
    categoryId: string,
  ) {
    const orders = await this.prisma.storeOrder.findMany({
      where: { productId, customer: { adminId } },
      select: {
        id: true,
        customerId: true,
        clientId: true,
        renewClientId: true,
        fulfillment: true,
        product: { select: { profile: { select: { providerId: true } } } },
      },
    });
    const byCustomer = new Map<string, Set<string>>();
    for (const order of orders) {
      const ids: string[] = [];
      if (order.clientId) ids.push(order.clientId);
      if (order.renewClientId) ids.push(order.renewClientId);
      const eylan =
        isEylanProvider(parseFulfillment(order.fulfillment)?.providerId) ||
        isEylanProvider(order.product?.profile?.providerId);
      if (eylan) ids.push(eylanServiceId(order.id));
      const pasarguard =
        isPasarguardProvider(parseFulfillment(order.fulfillment)?.providerId) ||
        isPasarguardProvider(order.product?.profile?.providerId);
      if (pasarguard) ids.push(pasarguardServiceId(order.id));
      if (!ids.length) continue;
      let set = byCustomer.get(order.customerId);
      if (!set) {
        set = new Set();
        byCustomer.set(order.customerId, set);
      }
      for (const id of ids) set.add(id);
    }
    for (const [customerId, clientIds] of byCustomer) {
      const customer = await this.prisma.storeCustomer.findUnique({
        where: { id: customerId },
        select: { metadata: true },
      });
      if (!customer) continue;
      const meta = {
        ...((customer.metadata && typeof customer.metadata === 'object'
          ? customer.metadata
          : {}) as Record<string, unknown>),
      };
      const cats = this.getClientCategories(meta);
      let changed = false;
      for (const cid of clientIds) {
        if (cats[cid] !== categoryId) {
          cats[cid] = categoryId;
          changed = true;
        }
      }
      if (!changed) continue;
      await this.prisma.storeCustomer.update({
        where: { id: customerId },
        data: {
          metadata: { ...meta, clientCategories: cats } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async assertRenewCategoryCompatible(
    adminId: string,
    clientId: string,
    productCategoryId: string | null | undefined,
    customerId?: string,
  ) {
    if (!productCategoryId) return;
    const existing = await this.prisma.storeOrder.findFirst({
      where: {
        OR: [{ clientId }, { renewClientId: clientId }],
        status: { in: ['ACTIVE', 'RENEWED'] },
        product: { adminId },
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    let lockedCategory = existing?.product.categoryId || null;
    if (!lockedCategory && customerId) {
      const customer = await this.prisma.storeCustomer.findUnique({
        where: { id: customerId },
        select: { metadata: true },
      });
      lockedCategory = this.getClientCategories(customer?.metadata)[clientId] || null;
    }
    if (lockedCategory && lockedCategory !== productCategoryId) {
      throw new BadRequestException(
        'Product category is not compatible with this service / دسته‌بندی پلن با این سرویس سازگار نیست',
      );
    }
  }

  private serializeNotification(notification: {
    id: string;
    type: string;
    title: string;
    message: string | null;
    payload: Prisma.JsonValue | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      ...notification,
      isRead: !!notification.readAt,
    };
  }

  private collapseNotifications<
    T extends { id: string; payload?: Prisma.JsonValue | null; isRead?: boolean },
  >(items: T[], limit = 12): T[] {
    const seenOrders = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
      const payload = (item.payload ?? {}) as Record<string, unknown>;
      const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
      if (orderId) {
        if (seenOrders.has(orderId)) continue;
        seenOrders.add(orderId);
      }
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }

  private async resolveCustomerServices(
    customerOrders: Array<{
      id?: string;
      status?: string;
      configName?: string | null;
      clientId: string | null;
      renewClientId: string | null;
      fulfillment?: unknown;
      product?: {
        name?: string | null;
        traffic?: bigint | number | null;
        durationDays?: number | null;
        categoryId?: string | null;
        profile?: { providerId?: string | null } | null;
      } | null;
    }>,
    linkedClientIds: string[] = [],
    adminId?: string | null,
  ) {
    const clientIds = new Set<string>();
    for (const order of customerOrders) {
      if (order.clientId) clientIds.add(order.clientId);
      if (order.renewClientId) clientIds.add(order.renewClientId);
    }
    for (const id of linkedClientIds) {
      if (id && !parseEylanServiceId(id) && !parsePasarguardServiceId(id)) clientIds.add(id);
    }

    const services = clientIds.size
      ? await this.prisma.client.findMany({
          where: { id: { in: [...clientIds] } },
          select: {
            id: true,
            email: true,
            remark: true,
            subId: true,
            subToken: true,
            enable: true,
            expiryTime: true,
            total: true,
            up: true,
            down: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const mapped = services.map((service) => this.serializeService(service));
    const seen = new Set(mapped.map((s) => s.id));
    let storeAdminId = adminId || null;
    if (!storeAdminId) {
      const firstId = customerOrders.find((o) => o.id)?.id;
      if (firstId) {
        storeAdminId =
          (
            await this.prisma.storeOrder.findFirst({
              where: { id: firstId },
              select: { store: { select: { adminId: true } } },
            })
          )?.store?.adminId || null;
      }
    }

    for (const order of customerOrders) {
      if (!order.id) continue;
      if (order.status && !['ACTIVE', 'RENEWED'].includes(order.status)) continue;
      let ff = parseFulfillment(order.fulfillment);
      const eylanOrder =
        isEylanProvider(ff?.providerId) ||
        isEylanProvider(order.product?.profile?.providerId) ||
        isNativeEylanSubUrl(ff?.subUrl);
      if (!eylanOrder) continue;

      const id = eylanServiceId(order.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const username = String(ff?.username || order.configName || 'eylan').trim() || 'eylan';
      let subUrl = isNativeEylanSubUrl(ff?.subUrl) ? String(ff!.subUrl).trim() : null;
      if (!subUrl && storeAdminId) {
        try {
          subUrl = await this.eylanProvider.ensureSubUrl({
            adminId: storeAdminId,
            username,
            storedSubUrl: ff?.subUrl,
          });
        } catch (err) {
          this.logger.warn(
            `Eylan portal sub repair failed for order ${order.id}: ${(err as Error)?.message || err}`,
          );
        }
      }

      // Backfill providerId + native subUrl so old purchases get Eylan portal UX + renew category.
      if (
        !isEylanProvider(ff?.providerId) ||
        (subUrl && ff?.subUrl !== subUrl) ||
        !ff?.username
      ) {
        const nextFf = {
          providerId: EYLAN_PROVIDER,
          username,
          ...(subUrl ? { subUrl } : ff?.subUrl ? { subUrl: ff.subUrl } : {}),
          ...(ff?.subToken || subUrl
            ? { subToken: extractSubTokenFromUrl(subUrl || ff?.subUrl || '') || ff?.subToken }
            : {}),
          ...(ff?.renewOfOrderId ? { renewOfOrderId: ff.renewOfOrderId } : {}),
        };
        try {
          await this.prisma.storeOrder.update({
            where: { id: order.id },
            data: { fulfillment: nextFf as Prisma.InputJsonValue },
          });
          ff = nextFf;
          order.fulfillment = nextFf;
        } catch (err) {
          this.logger.warn(
            `Eylan fulfillment backfill failed for ${order.id}: ${(err as Error)?.message || err}`,
          );
        }
      }

      let usedBytes = 0;
      let totalBytes = 0;
      let expiryMs = 0;
      if (storeAdminId) {
        const usage = await this.eylanProvider.fetchUsage(storeAdminId, username);
        usedBytes = usage.usedBytes;
        totalBytes = usage.totalBytes;
        expiryMs = usage.expiryMs;
      }
      mapped.push(
        this.serializeEylanService({
          id,
          username,
          subUrl,
          categoryId: order.product?.categoryId || null,
          productName: order.product?.name || null,
          trafficBytes: order.product?.traffic != null ? Number(order.product.traffic) : null,
          durationDays: order.product?.durationDays ?? null,
          usedBytes,
          totalBytes,
          expiryMs,
        }),
      );
    }

    for (const order of customerOrders) {
      if (!order.id) continue;
      if (order.status && !['ACTIVE', 'RENEWED'].includes(order.status)) continue;
      let ff = parseFulfillment(order.fulfillment);
      const pasarguardOrder =
        isPasarguardProvider(ff?.providerId) ||
        isPasarguardProvider(order.product?.profile?.providerId);
      if (!pasarguardOrder) continue;

      const id = pasarguardServiceId(order.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const username = String(ff?.username || order.configName || 'vpn').trim() || 'vpn';
      let subUrl = String(ff?.subUrl || '').trim() || null;
      if (!subUrl && storeAdminId) {
        try {
          subUrl = await this.pasarguardProvider.ensureSubUrl({
            adminId: storeAdminId,
            username,
            storedSubUrl: ff?.subUrl,
          });
        } catch (err) {
          this.logger.warn(
            `Pasarguard portal sub repair failed for order ${order.id}: ${(err as Error)?.message || err}`,
          );
        }
      }

      if (
        !isPasarguardProvider(ff?.providerId) ||
        (subUrl && ff?.subUrl !== subUrl) ||
        !ff?.username
      ) {
        const nextFf = {
          providerId: PASARGUARD_PROVIDER,
          username,
          ...(subUrl ? { subUrl } : ff?.subUrl ? { subUrl: ff.subUrl } : {}),
          ...(ff?.renewOfOrderId ? { renewOfOrderId: ff.renewOfOrderId } : {}),
        };
        try {
          await this.prisma.storeOrder.update({
            where: { id: order.id },
            data: { fulfillment: nextFf as Prisma.InputJsonValue },
          });
          ff = nextFf;
          order.fulfillment = nextFf;
        } catch (err) {
          this.logger.warn(
            `Pasarguard fulfillment backfill failed for ${order.id}: ${(err as Error)?.message || err}`,
          );
        }
      }

      let usedBytes = 0;
      let totalBytes = 0;
      let expiryMs = 0;
      if (storeAdminId) {
        const usage = await this.pasarguardProvider.fetchUsage(storeAdminId, username);
        usedBytes = usage.usedBytes;
        totalBytes = usage.totalBytes;
        expiryMs = usage.expiryMs;
      }
      mapped.push(
        this.serializePasarguardService({
          id,
          username,
          subUrl,
          categoryId: order.product?.categoryId || null,
          productName: order.product?.name || null,
          trafficBytes: order.product?.traffic != null ? Number(order.product.traffic) : null,
          durationDays: order.product?.durationDays ?? null,
          usedBytes,
          totalBytes,
          expiryMs,
        }),
      );
    }
    return mapped;
  }

  private getLinkedClientIds(metadata: unknown): string[] {
    const meta = (metadata || {}) as { linkedClientIds?: string[] };
    return Array.isArray(meta.linkedClientIds)
      ? meta.linkedClientIds.filter((id) => typeof id === 'string' && id.trim())
      : [];
  }

  private getHiddenClientIds(metadata: unknown): string[] {
    const meta = (metadata || {}) as { hiddenClientIds?: string[] };
    return Array.isArray(meta.hiddenClientIds)
      ? meta.hiddenClientIds.filter((id) => typeof id === 'string' && id.trim())
      : [];
  }

  /** Hide a service from the customer portal list only — does not delete the client/config. */
  async hideServiceFromCustomerList(sessionToken: string, clientId: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    const id = String(clientId || '').trim();
    if (!id) throw new BadRequestException('clientId is required');

    const linked = this.getLinkedClientIds(customer.metadata);
    const ownedOrder = await this.prisma.storeOrder.findFirst({
      where: {
        customerId: customer.id,
        OR: [
          { clientId: id },
          { renewClientId: id },
          ...(parseEylanServiceId(id) ? [{ id: parseEylanServiceId(id)! }] : []),
          ...(parsePasarguardServiceId(id) ? [{ id: parsePasarguardServiceId(id)! }] : []),
        ],
      },
      select: { id: true },
    });
    if (!ownedOrder && !linked.includes(id)) {
      throw new NotFoundException('Service not found on your account');
    }

    const meta = {
      ...((customer.metadata && typeof customer.metadata === 'object'
        ? customer.metadata
        : {}) as Record<string, unknown>),
    };
    const hidden = this.getHiddenClientIds(meta);
    if (!hidden.includes(id)) {
      await this.prisma.storeCustomer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...meta,
            hiddenClientIds: [...hidden, id],
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      ok: true,
      dashboard: await this.buildCustomerDashboard(customer.token),
    };
  }

  private async linkClientToCustomer(
    customerId: string,
    clientId: string,
    categoryId?: string | null,
  ) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const linked = this.getLinkedClientIds(customer.metadata);
    const meta = (customer.metadata || {}) as Record<string, unknown>;
    const cats = this.getClientCategories(meta);
    const nextLinked = linked.includes(clientId) ? linked : [...linked, clientId];
    const nextCats =
      categoryId && cats[clientId] !== categoryId
        ? { ...cats, [clientId]: categoryId }
        : cats;

    const linkedChanged = nextLinked.length !== linked.length;
    const catsChanged = JSON.stringify(nextCats) !== JSON.stringify(cats);
    if (!linkedChanged && !catsChanged) return;

    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          linkedClientIds: nextLinked,
          clientCategories: nextCats,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async linkEylanOrderToCustomer(
    customerId: string,
    orderId: string,
    categoryId?: string | null,
  ) {
    const serviceId = eylanServiceId(orderId);
    const customer = await this.prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer) return;
    const meta = {
      ...((customer.metadata && typeof customer.metadata === 'object'
        ? customer.metadata
        : {}) as Record<string, unknown>),
    };
    const linked = this.getLinkedClientIds(meta);
    const cats = this.getClientCategories(meta);
    const nextLinked = linked.includes(serviceId) ? linked : [...linked, serviceId];
    const nextCats =
      categoryId && cats[serviceId] !== categoryId ? { ...cats, [serviceId]: categoryId } : cats;
    const services = Array.isArray(meta.linkedServices)
      ? [...(meta.linkedServices as unknown[])]
      : [];
    if (!services.some((row) => (row as { orderId?: string })?.orderId === orderId)) {
      services.push({ providerId: EYLAN_PROVIDER, orderId });
    }
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          linkedClientIds: nextLinked,
          clientCategories: nextCats,
          linkedServices: services,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async linkPasarguardOrderToCustomer(
    customerId: string,
    orderId: string,
    categoryId?: string | null,
  ) {
    const serviceId = pasarguardServiceId(orderId);
    const customer = await this.prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer) return;
    const meta = {
      ...((customer.metadata && typeof customer.metadata === 'object'
        ? customer.metadata
        : {}) as Record<string, unknown>),
    };
    const linked = this.getLinkedClientIds(meta);
    const cats = this.getClientCategories(meta);
    const nextLinked = linked.includes(serviceId) ? linked : [...linked, serviceId];
    const nextCats =
      categoryId && cats[serviceId] !== categoryId ? { ...cats, [serviceId]: categoryId } : cats;
    const services = Array.isArray(meta.linkedServices)
      ? [...(meta.linkedServices as unknown[])]
      : [];
    if (!services.some((row) => (row as { orderId?: string })?.orderId === orderId)) {
      services.push({ providerId: PASARGUARD_PROVIDER, orderId });
    }
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          linkedClientIds: nextLinked,
          clientCategories: nextCats,
          linkedServices: services,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async unhideCustomerService(customerId: string, serviceId: string) {
    const customer = await this.prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer) return;
    const hidden = this.getHiddenClientIds(customer.metadata);
    if (!hidden.includes(serviceId)) return;
    const meta = {
      ...((customer.metadata && typeof customer.metadata === 'object'
        ? customer.metadata
        : {}) as Record<string, unknown>),
    };
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          hiddenClientIds: hidden.filter((hid) => hid !== serviceId),
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Attach an existing Eylan store order by `/sub/{token}/{username}`.
   * Never creates a Community Client row.
   */
  private async tryClaimEylanOrder(
    adminId: string,
    customerId: string,
    subscriptionLink: string,
    categoryId: string,
  ) {
    const parsed = parseEylanSubLink(subscriptionLink);
    if (!parsed) return null;
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        customerId,
        store: { adminId },
        status: { in: ['ACTIVE', 'RENEWED'] },
      },
      select: {
        id: true,
        configName: true,
        fulfillment: true,
        product: { select: { profile: { select: { providerId: true } } } },
      },
      take: 120,
    });
    const match = orders.find((order) => {
      const ff = parseFulfillment(order.fulfillment);
      const username = String(ff?.username || order.configName || '').trim();
      const tokenHit = !!(ff?.subToken && ff.subToken === parsed.token);
      const userHit = !!(username && username === parsed.username);
      const url = String(ff?.subUrl || '');
      const urlHit =
        !!url &&
        (url === subscriptionLink ||
          url.includes(`/sub/${parsed.token}/${parsed.username}`) ||
          isNativeEylanSubUrl(url));
      if (!tokenHit && !userHit && !urlHit) return false;
      // Prefer known Eylan; still accept native /sub match for older fulfillments missing providerId.
      return (
        isEylanProvider(ff?.providerId) ||
        isEylanProvider(order.product?.profile?.providerId) ||
        isNativeEylanSubUrl(ff?.subUrl) ||
        isNativeEylanSubUrl(subscriptionLink)
      );
    });
    if (!match) {
      return null;
    }

    let ff = parseFulfillment(match.fulfillment);
    const username =
      String(ff?.username || match.configName || parsed.username).trim() || parsed.username;
    let subUrl = isNativeEylanSubUrl(ff?.subUrl)
      ? String(ff!.subUrl).trim()
      : isNativeEylanSubUrl(subscriptionLink)
        ? String(subscriptionLink).trim()
        : null;
    if (!subUrl) {
      try {
        subUrl = await this.eylanProvider.ensureSubUrl({
          adminId,
          username,
          storedSubUrl: ff?.subUrl || subscriptionLink,
        });
      } catch (err) {
        this.logger.warn(
          `Eylan claim sub repair failed for ${match.id}: ${(err as Error)?.message || err}`,
        );
        subUrl = isNativeEylanSubUrl(subscriptionLink) ? String(subscriptionLink).trim() : null;
      }
    }

    if (
      !isEylanProvider(ff?.providerId) ||
      (subUrl && ff?.subUrl !== subUrl) ||
      !ff?.username
    ) {
      const nextFf = {
        providerId: EYLAN_PROVIDER,
        username,
        ...(subUrl ? { subUrl } : ff?.subUrl ? { subUrl: ff.subUrl } : {}),
        ...(ff?.subToken || parsed.token
          ? { subToken: extractSubTokenFromUrl(subUrl || ff?.subUrl || '') || parsed.token || ff?.subToken }
          : {}),
        ...(ff?.renewOfOrderId ? { renewOfOrderId: ff.renewOfOrderId } : {}),
      };
      try {
        await this.prisma.storeOrder.update({
          where: { id: match.id },
          data: { fulfillment: nextFf as Prisma.InputJsonValue },
        });
        ff = nextFf;
      } catch (err) {
        this.logger.warn(
          `Eylan claim fulfillment backfill failed for ${match.id}: ${(err as Error)?.message || err}`,
        );
      }
    }

    await this.linkEylanOrderToCustomer(customerId, match.id, categoryId);
    await this.unhideCustomerService(customerId, eylanServiceId(match.id));
    return this.serializeEylanService({
      id: eylanServiceId(match.id),
      username,
      subUrl: subUrl || ff?.subUrl || null,
      categoryId,
    });
  }

  private async tryClaimPasarguardOrder(
    adminId: string,
    customerId: string,
    subscriptionLink: string,
    categoryId: string,
  ) {
    const parsed = parsePasarguardSubLink(subscriptionLink);
    if (!parsed) return null;
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        customerId,
        store: { adminId },
        status: { in: ['ACTIVE', 'RENEWED'] },
      },
      select: {
        id: true,
        configName: true,
        fulfillment: true,
        product: { select: { profile: { select: { providerId: true } } } },
      },
      take: 120,
    });
    const match = orders.find((order) => {
      const ff = parseFulfillment(order.fulfillment);
      const username = String(ff?.username || order.configName || '').trim();
      const userHit = !!(username && parsed.username && username === parsed.username);
      const url = String(ff?.subUrl || '');
      const urlHit =
        !!url &&
        (url === subscriptionLink ||
          (!!parsed.token && url.includes(`/sub/${parsed.token}`)));
      if (!userHit && !urlHit) return false;
      return (
        isPasarguardProvider(ff?.providerId) ||
        isPasarguardProvider(order.product?.profile?.providerId) ||
        !!parsePasarguardSubLink(ff?.subUrl || '')
      );
    });
    if (!match) {
      return null;
    }

    let ff = parseFulfillment(match.fulfillment);
    const username =
      String(ff?.username || match.configName || parsed.username || '').trim() || 'vpn';
    let subUrl = String(ff?.subUrl || subscriptionLink || '').trim() || null;
    if (!subUrl) {
      try {
        subUrl = await this.pasarguardProvider.ensureSubUrl({
          adminId,
          username,
          storedSubUrl: ff?.subUrl || subscriptionLink,
        });
      } catch (err) {
        this.logger.warn(
          `Pasarguard claim sub repair failed for ${match.id}: ${(err as Error)?.message || err}`,
        );
      }
    }

    if (
      !isPasarguardProvider(ff?.providerId) ||
      (subUrl && ff?.subUrl !== subUrl) ||
      !ff?.username
    ) {
      const nextFf = {
        providerId: PASARGUARD_PROVIDER,
        username,
        ...(subUrl ? { subUrl } : ff?.subUrl ? { subUrl: ff.subUrl } : {}),
        ...(ff?.renewOfOrderId ? { renewOfOrderId: ff.renewOfOrderId } : {}),
      };
      try {
        await this.prisma.storeOrder.update({
          where: { id: match.id },
          data: { fulfillment: nextFf as Prisma.InputJsonValue },
        });
        ff = nextFf;
      } catch (err) {
        this.logger.warn(
          `Pasarguard claim fulfillment backfill failed for ${match.id}: ${(err as Error)?.message || err}`,
        );
      }
    }

    await this.linkPasarguardOrderToCustomer(customerId, match.id, categoryId);
    await this.unhideCustomerService(customerId, pasarguardServiceId(match.id));
    return this.serializePasarguardService({
      id: pasarguardServiceId(match.id),
      username,
      subUrl: subUrl || ff?.subUrl || null,
      categoryId,
    });
  }

  /** Claim a synced native Client row by Eylan/Pasarguard sub parser + remoteUsername. */
  private async tryClaimNativeClient(
    adminId: string,
    customerId: string,
    subscriptionLink: string,
    categoryId: string,
  ) {
    const eylan = parseEylanSubLink(subscriptionLink);
    const pasarguard = parsePasarguardSubLink(subscriptionLink);
    const username = String(eylan?.username || pasarguard?.username || '').trim();
    const panelType = eylan ? 'eylan' : pasarguard ? 'pasarguard' : null;
    if (!username || !panelType) return null;

    const client = await this.prisma.client.findFirst({
      where: {
        panel: { panelType },
        OR: [{ remoteUsername: username }, { email: username }],
        AND: {
          OR: [{ adminId }, { panel: { connection: { adminId } } }],
        },
      },
    });
    if (!client) return null;

    if (!client.adminId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { adminId },
      });
      (client as { adminId: string | null }).adminId = adminId;
    }

    await this.linkClientToCustomer(customerId, client.id, categoryId);
    await this.unhideCustomerService(customerId, client.id);
    return this.serializeService(client, categoryId);
  }

  /** Resolve + attach an existing subscription (by /s/ or /sub/ link) to the logged-in customer. */
  async claimServiceBySubscriptionLink(
    sessionToken: string,
    subscriptionLink: string,
    categoryId?: string | null,
  ) {
    this.rateLimit.check('claim-service', sessionToken);
    const customer = await this.customerAuth.validateSession(sessionToken);
    const link = String(subscriptionLink || '').trim();
    if (!link) throw new BadRequestException('subscriptionLink is required');

    const catId = String(categoryId || '').trim() || null;
    if (!catId) {
      throw new BadRequestException(
        'categoryId is required / دسته‌بندی سرویس را انتخاب کنید',
      );
    }
    const category = await this.prisma.productCategory.findFirst({
      where: { id: catId, adminId: customer.adminId, enabled: true },
    });
    if (!category) throw new BadRequestException('Invalid category');

    const eylanClaim = await this.tryClaimEylanOrder(
      customer.adminId,
      customer.id,
      link,
      catId,
    );
    if (eylanClaim) {
      return {
        service: {
          ...eylanClaim,
          categoryId: catId,
          systemSubUrl: eylanClaim.subUrl,
        },
        dashboard: await this.buildCustomerDashboard(customer.token),
      };
    }

    const pasarguardClaim = await this.tryClaimPasarguardOrder(
      customer.adminId,
      customer.id,
      link,
      catId,
    );
    if (pasarguardClaim) {
      return {
        service: {
          ...pasarguardClaim,
          categoryId: catId,
          systemSubUrl: pasarguardClaim.subUrl,
        },
        dashboard: await this.buildCustomerDashboard(customer.token),
      };
    }

    const nativeClaim = await this.tryClaimNativeClient(
      customer.adminId,
      customer.id,
      link,
      catId,
    );
    if (nativeClaim) {
      return {
        service: {
          ...nativeClaim,
          categoryId: catId,
          systemSubUrl: await this.buildSystemSubUrl(
            customer.adminId,
            nativeClaim.subId || nativeClaim.subToken,
          ),
        },
        dashboard: await this.buildCustomerDashboard(customer.token),
      };
    }

    const client = await this.provisioning.resolveRenewClientByToken(
      customer.adminId,
      link,
    );

    if (!client.adminId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { adminId: customer.adminId },
      });
      (client as { adminId: string | null }).adminId = customer.adminId;
    }

    await this.linkClientToCustomer(customer.id, client.id, catId);

    const fresh = await this.prisma.storeCustomer.findUnique({
      where: { id: customer.id },
    });
    const meta = {
      ...((fresh?.metadata && typeof fresh.metadata === 'object'
        ? fresh.metadata
        : {}) as Record<string, unknown>),
    };
    const hidden = this.getHiddenClientIds(meta);
    if (hidden.includes(client.id)) {
      await this.prisma.storeCustomer.update({
        where: { id: customer.id },
        data: {
          metadata: {
            ...meta,
            hiddenClientIds: hidden.filter((hid) => hid !== client.id),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      service: {
        ...this.serializeService(client),
        categoryId: catId,
        systemSubUrl: await this.buildSystemSubUrl(
          customer.adminId,
          client.subId || client.subToken,
        ),
      },
      dashboard: await this.buildCustomerDashboard(customer.token),
    };
  }

  /** Bot / internal claim without HTTP session. */
  async claimServiceForCustomer(
    adminId: string,
    customerId: string,
    subscriptionLink: string,
    categoryId: string,
  ) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const catId = String(categoryId || '').trim();
    const category = await this.prisma.productCategory.findFirst({
      where: { id: catId, adminId, enabled: true },
    });
    if (!category) throw new BadRequestException('Invalid category');
    const link = String(subscriptionLink || '').trim();
    if (!link) throw new BadRequestException('subscriptionLink is required');

    const eylanClaim = await this.tryClaimEylanOrder(adminId, customerId, link, catId);
    if (eylanClaim) {
      return {
        id: eylanClaim.id,
        label: eylanClaim.remark || eylanClaim.email,
        categoryId: catId,
        subId: null as string | null,
        systemSubUrl: eylanClaim.subUrl,
      };
    }

    const pasarguardClaim = await this.tryClaimPasarguardOrder(
      adminId,
      customerId,
      link,
      catId,
    );
    if (pasarguardClaim) {
      return {
        id: pasarguardClaim.id,
        label: pasarguardClaim.remark || pasarguardClaim.email,
        categoryId: catId,
        subId: null as string | null,
        systemSubUrl: pasarguardClaim.subUrl,
      };
    }

    const nativeClaim = await this.tryClaimNativeClient(adminId, customerId, link, catId);
    if (nativeClaim) {
      const subId = nativeClaim.subId || nativeClaim.subToken || null;
      return {
        id: nativeClaim.id,
        label: nativeClaim.remark || nativeClaim.email,
        categoryId: catId,
        subId,
        systemSubUrl: await this.buildSystemSubUrl(adminId, subId),
      };
    }

    const client = await this.provisioning.resolveRenewClientByToken(adminId, link);
    if (!client.adminId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { adminId },
      });
    }
    await this.linkClientToCustomer(customerId, client.id, catId);
    const subId = client.subId || client.subToken || null;
    return {
      id: client.id,
      label: client.remark || client.email || client.id.slice(0, 8),
      categoryId: catId,
      subId,
      systemSubUrl: await this.buildSystemSubUrl(adminId, subId),
    };
  }

  /** Public/HMPanel `/s/{subId}` — always system link, never native panel URL. */
  async buildSystemSubUrl(adminId: string, subId: string | null | undefined) {
    const token = String(subId || '').trim();
    if (!token) return null;
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    const custom =
      store?.domain?.domain &&
      (store.domain.status === 'SSL_ACTIVE' || store.domain.status === 'VERIFIED')
        ? store.domain.domain
        : null;
    const panel = String(process.env.PANEL_DOMAIN || process.env.DOMAIN || '')
      .split(':')[0]
      .trim();
    const host = custom || panel;
    if (!host) return `/s/${encodeURIComponent(token)}`;
    const proto = process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
    return `${proto}://${host}/s/${encodeURIComponent(token)}`;
  }

  private async prepareCouponCheckout(input: {
    slug?: string;
    adminId?: string;
    productId: string;
    customerToken?: string;
    limitIp?: number;
    selectedAddonIds?: string[];
    isRenewal?: boolean;
    sessionToken?: string;
  }) {
    const store = input.slug
      ? await this.prisma.storeProfile.findUnique({ where: { slug: input.slug } })
      : input.adminId
        ? await this.prisma.storeProfile.findUnique({ where: { adminId: input.adminId } })
        : null;
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    let customerId: string | null = null;
    let customerToken = String(input.customerToken || '').trim();
    if (input.sessionToken) {
      const sessionCustomer = await this.customerAuth.validateSession(input.sessionToken);
      if (sessionCustomer.adminId !== store.adminId) {
        throw new BadRequestException('Invalid session for this store');
      }
      customerId = sessionCustomer.id;
      customerToken = sessionCustomer.token;
    } else if (customerToken) {
      const c = await this.customers.getByToken(customerToken);
      if (c && c.adminId === store.adminId) customerId = c.id;
    }

    const product = await this.prisma.storeProduct.findFirst({
      where: {
        id: input.productId,
        adminId: store.adminId,
        visible: true,
        status: 'active',
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const currencyHint = (store.defaultCurrency || 'USD').toUpperCase();
    const hasToman = Number(product.priceToman) > 0;
    const hasUsd = Number(product.priceUsd) > 0;
    const useToman =
      (['IRT', 'IRR', 'TOMAN', 'TMN'].includes(currencyHint) && hasToman) ||
      (hasToman && !hasUsd);
    const currency = useToman ? 'TOMAN' : hasUsd ? 'USD' : hasToman ? 'TOMAN' : 'USD';
    const baseAmount =
      currency === 'TOMAN' || currency === 'IRR'
        ? Number(product.priceToman ?? 0)
        : Number(product.priceUsd ?? 0);

    let priceExtra = 0;
    if (!input.isRenewal && input.limitIp != null) {
      const choice = await this.resolveIpLimitChoice(
        store.adminId,
        product as any,
        input.limitIp,
        currency,
      );
      priceExtra = Number(choice.priceExtra || 0);
    }
    const addonSelection = await this.resolveAddonSelection(
      store.adminId,
      product as any,
      input.selectedAddonIds || [],
      currency,
    );
    const amount = baseAmount + priceExtra + Number(addonSelection.extraPrice || 0);
    return {
      store,
      product,
      customerId,
      customerToken,
      currency,
      amount,
    };
  }

  /** Preview discount before checkout (no order / no redemption). */
  async previewCoupon(input: {
    slug?: string;
    adminId?: string;
    productId: string;
    customerToken?: string;
    couponCode?: string;
    limitIp?: number;
    selectedAddonIds?: string[];
    isRenewal?: boolean;
    sessionToken?: string;
  }) {
    const ctx = await this.prepareCouponCheckout(input);
    if (!ctx.customerId || !ctx.customerToken) {
      throw new BadRequestException('Login or customer token required to validate coupon');
    }
    const priced = await this.coupons.validateAndPrice({
      adminId: ctx.store.adminId,
      customerId: ctx.customerId,
      customerToken: ctx.customerToken,
      productId: ctx.product.id,
      categoryId: ctx.product.categoryId,
      code: input.couponCode,
      amount: ctx.amount,
      currency: ctx.currency,
      isRenewal: !!input.isRenewal,
    });
    return {
      currency: ctx.currency,
      amount: ctx.amount,
      discountAmount: priced.discountAmount,
      finalAmount: priced.finalAmount,
      code: priced.coupon?.code || null,
    };
  }

  /** Coupons valid for this product (and customer, when logged in). Empty offers still keep a typed-code field. */
  async listApplicableCoupons(input: {
    slug?: string;
    adminId?: string;
    productId: string;
    customerToken?: string;
    limitIp?: number;
    selectedAddonIds?: string[];
    isRenewal?: boolean;
    sessionToken?: string;
  }) {
    const ctx = await this.prepareCouponCheckout(input);
    const offers = await this.coupons.listApplicable({
      adminId: ctx.store.adminId,
      customerId: ctx.customerId,
      customerToken: ctx.customerToken,
      productId: ctx.product.id,
      categoryId: ctx.product.categoryId,
      amount: ctx.amount,
      currency: ctx.currency,
      isRenewal: !!input.isRenewal,
    });
    return {
      currency: ctx.currency,
      amount: ctx.amount,
      offers: offers.map((o) => ({ ...o, currency: ctx.currency, amount: ctx.amount })),
    };
  }

  /** Renew plans for one service — same category only. */
  async listRenewProductsForClient(adminId: string, customerId: string, clientId: string) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
      include: {
        orders: {
          select: {
            id: true,
            clientId: true,
            renewClientId: true,
            createdAt: true,
            fulfillment: true,
            product: {
              select: {
                categoryId: true,
                profile: { select: { providerId: true } },
              },
            },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const map = this.categoryIdByClientId(customer.orders as any, customer.metadata);
    const categoryId = map.get(clientId) || null;
    if (!categoryId) {
      return { categoryId: null, products: [] as any[] };
    }
    const productsRaw = await this.prisma.storeProduct.findMany({
      where: {
        adminId,
        visible: true,
        renewable: true,
        status: 'active',
        isTest: false,
        categoryId,
      },
      include: { category: true, profile: { select: { providerId: true } } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 40,
    });
    const wantEylan = !!parseEylanServiceId(clientId);
    const wantPasarguard = !!parsePasarguardServiceId(clientId);
    const matched = productsRaw.filter((p) => {
      if (wantEylan) return isEylanProvider(p.profile?.providerId);
      if (wantPasarguard) return isPasarguardProvider(p.profile?.providerId);
      return (
        !isEylanProvider(p.profile?.providerId) && !isPasarguardProvider(p.profile?.providerId)
      );
    });
    const products = await this.excludeDisabledPluginProducts(adminId, matched);
    return {
      categoryId,
      products: products.map((product) => this.serializeProduct(product)),
    };
  }

  async assignServiceCategory(
    sessionToken: string,
    clientId: string,
    categoryId: string,
  ) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    await this.assignServiceCategoryInternal(
      customer.adminId,
      customer.id,
      clientId,
      categoryId,
    );
    return this.buildCustomerDashboard(customer.token);
  }

  async assignServiceCategoryInternal(
    adminId: string,
    customerId: string,
    clientId: string,
    categoryId: string,
  ) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, adminId, enabled: true },
    });
    if (!category) throw new BadRequestException('Invalid category');

    const services = await this.resolveCustomerServices(
      await this.prisma.storeOrder.findMany({
        where: { customerId },
        select: {
          id: true,
          clientId: true,
          renewClientId: true,
          fulfillment: true,
          status: true,
          configName: true,
          product: {
            select: {
              categoryId: true,
              name: true,
              traffic: true,
              durationDays: true,
              profile: { select: { providerId: true } },
            },
          },
        },
      }),
      this.getLinkedClientIds(customer.metadata),
      adminId,
    );
    if (!services.some((s) => s.id === clientId)) {
      await this.linkClientToCustomer(customerId, clientId, categoryId);
    } else {
      await this.setClientCategory(customerId, clientId, categoryId);
    }
    return { ok: true as const, categoryId };
  }

  private async listCompatibleRenewProducts(
    adminId: string,
    orders: Array<{
      clientId: string | null;
      renewClientId: string | null;
      product: { categoryId: string };
    }>,
    metadata?: unknown,
  ) {
    const fromOrders = [
      ...new Set(orders.map((order) => order.product.categoryId).filter(Boolean)),
    ];
    const fromMeta = Object.values(this.getClientCategories(metadata));
    const categoryIds = [...new Set([...fromOrders, ...fromMeta])];
    const products = await this.prisma.storeProduct.findMany({
      where: {
        adminId,
        visible: true,
        renewable: true,
        status: 'active',
        isTest: false,
        ...(categoryIds.length ? { categoryId: { in: categoryIds } } : { id: '__none__' }),
      },
      include: { category: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    });
    return products.map((product) => this.serializeProduct(product));
  }

  private async buildCustomerDashboard(
    customerToken: string,
    opts?: { authChannel?: string },
  ) {
    const customer = await this.customers.getByToken(customerToken);
    if (!customer) throw new NotFoundException('Customer not found');

    const showTestProducts = opts?.authChannel === 'telegram';

    const [store, branding, servicesRaw, renewProducts, catalogProducts, categories] =
      await Promise.all([
        this.prisma.storeProfile.findUnique({
          where: { adminId: customer.adminId },
        }),
        this.buildPublicBranding(customer.adminId),
        this.resolveCustomerServices(
          customer.orders,
          this.getLinkedClientIds(customer.metadata),
          customer.adminId,
        ),
        this.listCompatibleRenewProducts(customer.adminId, customer.orders, customer.metadata),
        this.prisma.storeProduct.findMany({
          where: {
            adminId: customer.adminId,
            visible: true,
            status: 'active',
          },
          include: { category: true, profile: { select: { providerId: true } } },
          orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
        }),
        this.prisma.productCategory.findMany({
          where: { adminId: customer.adminId, visible: true, enabled: true },
          orderBy: [{ sortOrder: 'asc' }],
        }),
      ]);

    const hidden = new Set(this.getHiddenClientIds(customer.metadata));
    const categoryByClient = this.categoryIdByClientId(customer.orders, customer.metadata);
    const visibleCatalog = (
      await this.excludeDisabledPluginProducts(customer.adminId, catalogProducts)
    ).filter((product) => showTestProducts || !product.isTest);
    visibleCatalog.sort((a, b) => {
      const rank = (p: (typeof visibleCatalog)[number]) => {
        if (p.isTest) return 0;
        if (this.isZeroPriceProduct(p)) return 1;
        return 2;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const featured = Number(b.featured ? 1 : 0) - Number(a.featured ? 1 : 0);
      if (featured !== 0) return featured;
      return Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    });
    const services = servicesRaw
      .filter((service) => !hidden.has(service.id))
      .map((service) => ({
        ...service,
        // Prefer order-derived category; keep serializeEylanService categoryId as fallback.
        categoryId: categoryByClient.get(service.id) || service.categoryId || null,
      }));

    const pendingStatuses: StoreOrderStatus[] = [
      'PENDING_PAYMENT',
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'PROVISIONING',
      'PROVISION_FAILED',
    ];

    const publishedTheme = store
      ? (await this.themes?.resolvePublished(store.theme)) || null
      : null;
    const storePayment = store ? await this.resolveStorefrontPayment(store) : null;

    return {
      token: customer.token,
      profile: {
        id: customer.id,
        name: customer.name,
        telegram: customer.telegram,
        whatsapp: customer.whatsapp,
        email: customer.email,
        telegramUserId: customer.telegramUserId || null,
      },
      store: {
        slug: store?.slug,
        title: store?.title,
        description: store?.description,
        logoUrl: branding.logo || store?.logo,
        logoDarkUrl: branding.logoDark || null,
        defaultCurrency: store?.defaultCurrency,
        payment: storePayment,
        publishedTheme,
      },
      branding,
      publishedTheme,
      supportLinks: branding.supportLinks,
      services,
      activeServices: services.filter((service) => service.status === 'active'),
      expiredServices: services.filter(
        (service) =>
          service.status === 'expired' ||
          service.status === 'depleted' ||
          service.status === 'disabled',
      ),
      pendingOrders: customer.orders.filter((order) => pendingStatuses.includes(order.status)),
      orders: customer.orders.map((order) => {
        const renewName =
          order.renewClient?.email?.trim() ||
          order.renewClient?.remark?.trim() ||
          '';
        const clientName =
          order.client?.email?.trim() || order.client?.remark?.trim() || '';
        const stored = String(order.configName || '').trim();
        const configName = order.isRenewal
          ? renewName || clientName || (stored && stored !== 'renewal' ? stored : null)
          : clientName || stored || null;
        return {
          id: order.id,
          trackingCode: order.trackingCode,
          status: order.status,
          amount: order.amount,
          currency: order.currency,
          isRenewal: order.isRenewal,
          productName: order.product.name,
          configName,
          categoryId: order.product.categoryId,
          createdAt: order.createdAt,
          timeline: order.timeline,
          payment: order.payment,
        };
      }),
      products: await Promise.all(
        visibleCatalog.map(async (product) => {
          const enriched = await this.enrichProductIpOptions(customer.adminId, product);
          if (!product.isTest) return enriched;
          const eligibility = await this.getTestProductEligibility(customer.id, product);
          return {
            ...enriched,
            isTest: true,
            testCooldownDays:
              product.testCooldownoldownDays ?? product.testCooldownDays ?? 30,
            testEligible: eligibility.eligible,
            testNextAvailableAt: eligibility.nextAvailableAt,
          };
        }),
      ),
      renewProducts,
      categories,
      authChannel: opts?.authChannel || 'token',
      notifications: this.collapseNotifications(
        customer.notifications.map((notification) => this.serializeNotification(notification)),
      ),
      activity: customer.activities,
    };
  }

  async getPublicStoreBySlug(slug: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { slug },
      include: { domain: true },
    });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    const [productsRaw, categoriesRaw, branding] = await Promise.all([
      this.prisma.storeProduct.findMany({
        where: { adminId: store.adminId, visible: true, status: 'active', isTest: false },
        include: { category: true, profile: { select: { providerId: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.productCategory.findMany({
        where: { adminId: store.adminId, visible: true, enabled: true },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.buildPublicBranding(store.adminId),
    ]);
    const products = await this.excludeDisabledPluginProducts(store.adminId, productsRaw);
    const visibleCatIds = new Set(products.map((p) => p.categoryId).filter(Boolean));
    const categories = categoriesRaw.filter((c) => visibleCatIds.has(c.id));

    const publishedTheme = (await this.themes?.resolvePublished(store.theme)) || null;
    const payment = await this.resolveStorefrontPayment(store);

    return {
      store: {
        title: store.title,
        description: store.description,
        slug: store.slug,
        logoUrl: branding.logo || store.logo,
        logoDarkUrl: branding.logoDark || null,
        defaultCurrency: store.defaultCurrency,
        paymentInstructions: payment.instructions,
        bankName: payment.bankName,
        bankCardNumber: payment.cardNumber,
        bankCardHolder: payment.cardHolder,
        bankIban: payment.iban,
        bankAccountInfo: store.bankAccountInfo,
        branding,
        publishedTheme,
        themeId: publishedTheme?.id || null,
        welcome: {
          headline: branding.name || store.title,
          description: branding.description || store.description,
          primaryAction: 'new-order',
          secondaryAction: 'login',
        },
        payment,
      },
      categories,
      products: await Promise.all(
        products.map((p) =>
          this.enrichProductIpOptions(store.adminId, p, store.defaultCurrency),
        ),
      ),
    };
  }

  async getPublicStoreByDomain(host: string) {
    const normalized = host.toLowerCase().split(':')[0];
    const domain = await this.prisma.domain.findFirst({
      where: {
        domain: normalized,
        status: { in: ['VERIFIED', 'SSL_ACTIVE'] },
      },
      include: { storeProfile: true, admin: { select: { id: true } } },
    });
    if (!domain?.adminId) throw new NotFoundException('Store not found');

    let store = domain.storeProfile;
    if (!store) {
      store = await this.prisma.storeProfile.findUnique({
        where: { adminId: domain.adminId },
      });
      if (store && !store.domainId) {
        await this.prisma.storeProfile.update({
          where: { id: store.id },
          data: { domainId: domain.id },
        });
      }
    }
    if (!store?.enabled) throw new NotFoundException('Store not found');
    return this.getPublicStoreBySlug(store.slug);
  }

  async lookupCustomer(slug: string, token: string, requestKey: string) {
    this.rateLimit.check('customerLookup', requestKey);
    const customer = await this.customers.lookupByStore(slug, token);
    if (!customer) throw new NotFoundException('Customer not found');
    return {
      id: customer.id,
      token: customer.token,
      name: customer.name,
      telegram: customer.telegram,
      whatsapp: customer.whatsapp,
      email: customer.email,
      telegramUserId: customer.telegramUserId || null,
    };
  }

  async createCustomerSession(
    token: string,
    requestKey: string,
    context?: { userAgent?: string; ipAddress?: string | null },
  ) {
    this.rateLimit.check('customerLogin', requestKey);
    return this.customerAuth.loginWithPermanentToken(token, context);
  }

  async getCustomerSession(sessionToken: string) {
    const session = await this.customerAuth.validateSessionWithMeta(sessionToken);
    return this.buildCustomerDashboard(session.customer.token, {
      authChannel: session.authChannel,
    });
  }

  async logoutCustomerSession(sessionToken: string) {
    return this.customerAuth.revokeSession(sessionToken);
  }

  async markNotificationAsRead(sessionToken: string, notificationId: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    await this.customerNotifications.markAsRead(customer.id, notificationId);
    return { ok: true };
  }

  async markAllNotificationsAsRead(sessionToken: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    await this.customerNotifications.markAllAsRead(customer.id);
    return { ok: true };
  }

  async createCheckout(slug: string, payload: CheckoutPayload, requestKey = slug) {
    try {
      return await this.createCheckoutInner(slug, payload, requestKey);
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err?.getStatus
      ) {
        throw err;
      }
      const code = String(err?.code || '');
      const msg = String(err?.message || err || '');
      this.logger.error(`Checkout failed for store "${slug}": ${code} ${msg}`);
      if (code === 'P2002' || /unique constraint/i.test(msg)) {
        throw new BadRequestException(
          'Could not create order (duplicate record). Please retry. / ثبت سفارش تکراری شد — دوباره تلاش کنید',
        );
      }
      if (code === 'P2022' || /column .* does not exist/i.test(msg)) {
        throw new BadRequestException(
          'Store database schema is outdated. Update Community panel and restart. / اسکیمای دیتابیس قدیمی است — Community را آپدیت و ری‌استارت کنید',
        );
      }
      if (code === 'P2003' || /foreign key/i.test(msg)) {
        throw new BadRequestException(
          'Invalid store data (product/profile). Check provisioning profile and category. / داده فروشگاه نامعتبر است',
        );
      }
      throw new BadRequestException(
        msg.slice(0, 280) || 'Checkout failed / ثبت سفارش ناموفق بود',
      );
    }
  }

  private isZeroPriceProduct(product: {
    priceUsd?: number | null;
    priceToman?: number | null;
  }) {
    return !(Number(product.priceToman) > 0) && !(Number(product.priceUsd) > 0);
  }

  private isInstantFreeCheckoutProduct(
    product: {
      isTest?: boolean;
      priceUsd?: number | null;
      priceToman?: number | null;
    },
    authChannel?: string,
  ) {
    if (product.isTest) return true;
    return this.isZeroPriceProduct(product) && authChannel === 'telegram';
  }

  private async resolveCheckoutAuthChannel(
    payload: CheckoutPayload,
  ): Promise<string | undefined> {
    const token = String(payload.customerSessionToken || '').trim();
    if (!token) return undefined;
    try {
      const meta = await this.customerAuth.validateSessionWithMeta(token);
      return meta.authChannel || 'token';
    } catch {
      return undefined;
    }
  }

  private async createCheckoutInner(slug: string, payload: CheckoutPayload, requestKey = slug) {
    this.rateLimit.check('checkout', requestKey);
    const store = await this.prisma.storeProfile.findUnique({ where: { slug } });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    const authChannel = await this.resolveCheckoutAuthChannel(payload);

    const product = await this.prisma.storeProduct.findFirst({
      where: { id: payload.productId, adminId: store.adminId, visible: true, status: 'active' },
      include: { category: true, profile: { select: { providerId: true, panelId: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.assertPluginProfileUsable(store.adminId, product.profileId);

    const currencyHint = (payload.currency || store.defaultCurrency || 'USD').toUpperCase();
    const hasToman = Number(product.priceToman) > 0;
    const hasUsd = Number(product.priceUsd) > 0;
    const tomanCurrencies = new Set(['IRT', 'IRR', 'TOMAN', 'TMN']);
    const useToman =
      (tomanCurrencies.has(currencyHint) && hasToman) ||
      (hasToman && !hasUsd);
    const currency = useToman
      ? currencyHint === 'IRR'
        ? 'IRR'
        : 'TOMAN'
      : hasUsd
        ? 'USD'
        : hasToman
          ? 'TOMAN'
          : 'USD';
    const amount = useToman || currency === 'TOMAN' || currency === 'IRR'
      ? Number(product.priceToman ?? 0)
      : Number(product.priceUsd ?? 0);

    const addonSelection = await this.resolveAddonSelection(
      store.adminId,
      product as any,
      payload.selectedAddonIds || [],
      currency,
    );
    const baseLimitIp = await this.readBaseLimitIp(product.id);
    let extraPrice = Number(addonSelection.extraPrice || 0);
    let extraLimitIp = Number(addonSelection.extraLimitIp || 0);
    if (
      !payload.isRenewal &&
      payload.selectedAddonIds === undefined &&
      payload.limitIp != null
    ) {
      const ipChoice = await this.resolveIpLimitChoice(
        store.adminId,
        product as any,
        payload.limitIp,
        currency,
      );
      extraPrice += Number(ipChoice.priceExtra || 0);
      extraLimitIp += Number(ipChoice.limitIp || 0);
    }
    const finalLimitIp = Math.max(0, baseLimitIp + extraLimitIp);
    const finalDurationDays = Math.max(
      0,
      Number(product.durationDays || 0) + Number(addonSelection.extraDays || 0),
    );
    const amountWithIp = amount + extraPrice;

    let renewClientId: string | undefined;
    let renewConfigName: string | undefined;
    let eylanFulfillmentSeed: Record<string, unknown> | undefined;
    let pasarguardFulfillmentSeed: Record<string, unknown> | undefined;
    let ownedEylanCustomerId: string | null = null;
    let ownedEylanCategoryId: string | null = null;
    let ownedPasarguardCustomerId: string | null = null;
    let ownedPasarguardCategoryId: string | null = null;
    if (payload.isRenewal) {
      if (!payload.renewClientId) throw new BadRequestException('Renewal requires a service');
      const eylanOrderId = parseEylanServiceId(payload.renewClientId);
      const pasarguardOrderId = parsePasarguardServiceId(payload.renewClientId);
      if (eylanOrderId) {
        if (!isEylanProvider(product.profile?.providerId)) {
          throw new BadRequestException('This service can only be renewed with an Eylan product');
        }
        const owned = await this.prisma.storeOrder.findFirst({
          where: { id: eylanOrderId, storeId: store.id },
          include: { product: { select: { categoryId: true } } },
        });
        if (!owned) throw new BadRequestException('Service not found for renewal');
        ownedEylanCustomerId = owned.customerId;
        ownedEylanCategoryId = owned.product?.categoryId || null;
        const ff = parseFulfillment(owned.fulfillment);
        const username = ff?.username || owned.configName;
        if (!username || username === 'renewal') {
          throw new BadRequestException('Service not found for renewal');
        }
        renewConfigName = username;
        eylanFulfillmentSeed = {
          providerId: EYLAN_PROVIDER,
          username,
          subUrl: ff?.subUrl,
          subToken: ff?.subToken,
          renewOfOrderId: owned.id,
        };
      } else if (pasarguardOrderId) {
        if (!isPasarguardProvider(product.profile?.providerId)) {
          throw new BadRequestException('This service can only be renewed with a Pasarguard product');
        }
        const owned = await this.prisma.storeOrder.findFirst({
          where: { id: pasarguardOrderId, storeId: store.id },
          include: { product: { select: { categoryId: true } } },
        });
        if (!owned) throw new BadRequestException('Service not found for renewal');
        ownedPasarguardCustomerId = owned.customerId;
        ownedPasarguardCategoryId = owned.product?.categoryId || null;
        const ff = parseFulfillment(owned.fulfillment);
        const username = ff?.username || owned.configName;
        if (!username || username === 'renewal') {
          throw new BadRequestException('Service not found for renewal');
        }
        renewConfigName = username;
        pasarguardFulfillmentSeed = {
          providerId: PASARGUARD_PROVIDER,
          username,
          subUrl: ff?.subUrl,
          renewOfOrderId: owned.id,
        };
      } else {
        if (isEylanProvider(product.profile?.providerId)) {
          throw new BadRequestException('This product can only renew Eylan services');
        }
        if (isPasarguardProvider(product.profile?.providerId)) {
          throw new BadRequestException('This product can only renew Pasarguard services');
        }
        const client = await this.provisioning.resolveRenewClient(store.adminId, payload.renewClientId);
        renewClientId = client.id;
        renewConfigName = String(client.email || client.remark || '').trim() || undefined;
      }

      if (!product.renewable) {
        throw new BadRequestException('Product is not compatible for renewal');
      }
    } else if (!payload.configName && !payload.isRenewal && !this.isInstantFreeCheckoutProduct(product, authChannel)) {
      throw new BadRequestException('Config name is required');
    }

    const customer = await this.customers.findOrCreate(store.adminId, {
      token: payload.customerToken,
      name: payload.name,
      telegram: payload.telegram,
      whatsapp: payload.whatsapp,
      email: payload.email,
    });

    const isTestProduct = !!(product as any).isTest;
    const instantFreeCheckout = this.isInstantFreeCheckoutProduct(product as any, authChannel);
    if (isTestProduct) {
      await this.assertTestProductAllowed(customer.id, product as any);
      await this.assertTestCheckoutChannel(customer, {
        sessionToken: payload.customerSessionToken,
        requestKey,
      });
    } else if (instantFreeCheckout) {
      await this.assertTestCheckoutChannel(customer, {
        sessionToken: payload.customerSessionToken,
        requestKey,
      });
    }

    const configName = payload.isRenewal
      ? renewConfigName || 'renewal'
      : instantFreeCheckout
        ? await this.provisioning.generateUniqueConfigName(
            `test-${customer.id.slice(-8)}`,
            store.adminId,
          )
        : await this.provisioning.generateUniqueConfigName(payload.configName!, store.adminId);

    if (payload.isRenewal && renewClientId) {
      await this.assertRenewCategoryCompatible(
        store.adminId,
        renewClientId,
        product.categoryId,
        customer.id,
      );
    }
    if (payload.isRenewal && ownedEylanCustomerId) {
      if (!customer || ownedEylanCustomerId !== customer.id) {
        throw new BadRequestException('Service not found for renewal');
      }
      if (
        ownedEylanCategoryId &&
        product.categoryId &&
        ownedEylanCategoryId !== product.categoryId
      ) {
        throw new BadRequestException(
          'Product category is not compatible with this service / دسته‌بندی پلن با این سرویس سازگار نیست',
        );
      }
    }
    if (payload.isRenewal && ownedPasarguardCustomerId) {
      if (!customer || ownedPasarguardCustomerId !== customer.id) {
        throw new BadRequestException('Service not found for renewal');
      }
      if (
        ownedPasarguardCategoryId &&
        product.categoryId &&
        ownedPasarguardCategoryId !== product.categoryId
      ) {
        throw new BadRequestException(
          'Product category is not compatible with this service / دسته‌بندی پلن با این سرویس سازگار نیست',
        );
      }
    }
    if (!customer) throw new ForbiddenException('Invalid customer token');

    await this.assertAdminTrafficForOrder(store.adminId, product);

    const rawPay = String(payload.paymentMethod || '')
      .toUpperCase()
      .replace(/[\s-]/g, '_');
    const paymentMethod: StorePaymentMethod =
      !instantFreeCheckout && rawPay === 'WALLET'
        ? 'WALLET'
        : !instantFreeCheckout && rawPay === 'TELEGRAM_STARS'
          ? ('TELEGRAM_STARS' as StorePaymentMethod)
          : !instantFreeCheckout && rawPay === 'TELEGRAM_WALLET'
            ? ('TELEGRAM_WALLET' as StorePaymentMethod)
            : 'MANUAL_BANK';
    const starsPay = this.isStarsMethod(paymentMethod);
    const walletPay = this.isWalletPayMethod(paymentMethod);
    if (starsPay) {
      const assigned = await this.listPaymentGateways(store.adminId);
      if (!assigned.gateways.includes('telegram_stars')) {
        throw new BadRequestException('Telegram Stars is not enabled for this store');
      }
    }
    if (walletPay) {
      const assigned = await this.listPaymentGateways(store.adminId);
      if (!assigned.gateways.includes('telegram_wallet')) {
        throw new BadRequestException('Telegram Wallet Pay is not enabled for this store');
      }
    }

    const priced = await this.coupons.validateAndPrice({
      adminId: store.adminId,
      customerId: customer.id,
      customerToken: customer.token,
      productId: product.id,
      categoryId: product.categoryId,
      code: payload.couponCode,
      amount: amountWithIp,
      currency,
      isRenewal: !!payload.isRenewal,
    });
    const appliedCoupon = priced.coupon;
    const discountAmount = priced.discountAmount;
    // Test SKUs are always free / auto-delivered — no payment step.
    const finalAmount = instantFreeCheckout ? 0 : priced.finalAmount;

    const hasPayment = !!(payload.receiptText || payload.receiptImage);
    if (
      paymentMethod === 'MANUAL_BANK' &&
      payload.isRenewal &&
      !hasPayment &&
      !instantFreeCheckout &&
      !starsPay &&
      !walletPay
    ) {
      throw new BadRequestException(
        'Payment receipt is required for renewals / برای تمدید ارسال رسید الزامی است',
      );
    }
    if (paymentMethod === 'WALLET' && finalAmount > 0) {
      const bal = await this.wallet.getBalance(customer.id, store.defaultCurrency || 'USD');
      if (Number(bal.balance) + 1e-9 < finalAmount) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }
    const initialStatus: StoreOrderStatus = instantFreeCheckout
      ? 'APPROVED'
      : hasPayment
        ? 'PAYMENT_SUBMITTED'
        : 'PENDING_PAYMENT';

    const delayMinutes = Math.max(1, Number(store.autoDeliverDelayMinutes) || 10);
    const scheduleAutoDeliver = !!(
      !instantFreeCheckout &&
      paymentMethod === 'MANUAL_BANK' &&
      !starsPay &&
      !walletPay &&
      hasPayment &&
      store.autoDeliverEnabled &&
      // Blocked/restricted customers never get the automatic receipt approval.
      String(customer.status || 'active') === 'active'
    );
    const autoDeliverAt = scheduleAutoDeliver
      ? new Date(Date.now() + delayMinutes * 60_000)
      : null;

    // Allocate outside the write transaction — a failed nextOrderNumber update
    // must not abort the Postgres transaction that creates the order + payment.
    let order: Awaited<ReturnType<typeof this.prisma.storeOrder.create>>;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const trackingCode = await this.allocateOrderNumber(this.prisma, store.id);
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const created = await tx.storeOrder.create({
            data: {
              trackingCode,
              storeId: store.id,
              productId: product.id,
              customerId: customer.id,
              configName,
              amount: finalAmount,
              currency,
              status:
                instantFreeCheckout || paymentMethod === 'WALLET' ? 'APPROVED' : initialStatus,
              notes: payload.notes,
              isRenewal: !!payload.isRenewal,
              renewClientId,
              pendingReview:
                instantFreeCheckout || paymentMethod === 'WALLET' ? false : scheduleAutoDeliver,
              autoDeliverAt:
                instantFreeCheckout || paymentMethod === 'WALLET' ? null : autoDeliverAt,
              couponId: appliedCoupon?.id || null,
              discountAmount,
              limitIp: finalLimitIp > 0 ? finalLimitIp : null,
              fulfillment: {
                ...((eylanFulfillmentSeed ||
                  pasarguardFulfillmentSeed ||
                  {}) as Record<string, unknown>),
                checkout: {
                  selectedAddonIds: addonSelection.selectedIds,
                  selectedAddons: addonSelection.selected.map((a) => ({
                    id: a.id,
                    type: a.type,
                    label: a.label,
                    limitIp: a.limitIp,
                    days: a.days,
                    priceExtra: a.priceExtra,
                  })),
                  extraDays: addonSelection.extraDays,
                  extraLimitIp: addonSelection.extraLimitIp,
                  finalDurationDays,
                  finalLimitIp: finalLimitIp > 0 ? finalLimitIp : null,
                },
              } as Prisma.InputJsonValue,
              ...(prismaKnowsOrderIsTest() ? { isTest: isTestProduct } : {}),
            },
          });
          if (isTestProduct && !prismaKnowsOrderIsTest()) {
            await tx.$executeRaw`UPDATE "StoreOrder" SET "isTest" = true WHERE "id" = ${created.id}`;
          }

          await tx.storePayment.create({
            data: {
              orderId: created.id,
              method: paymentMethod,
              status:
                instantFreeCheckout || paymentMethod === 'WALLET'
                  ? 'APPROVED'
                  : hasPayment
                    ? 'SUBMITTED'
                    : 'PENDING',
              amount: finalAmount,
              currency,
              receiptText: instantFreeCheckout
                ? payload.receiptText || 'test-auto'
                : paymentMethod === 'WALLET'
                  ? payload.receiptText ||
                    'پرداخت از موجودی کیف پول انجام شد. / Paid from wallet balance.'
                  : starsPay
                    ? 'Telegram Stars'
                    : walletPay
                      ? 'Telegram Wallet Pay'
                      : payload.receiptText,
              receiptImage: paymentMethod === 'WALLET' || starsPay || walletPay ? null : payload.receiptImage,
              reviewedAt:
                instantFreeCheckout || paymentMethod === 'WALLET' ? new Date() : undefined,
              reviewedBy: instantFreeCheckout
                ? 'test'
                : paymentMethod === 'WALLET'
                  ? 'wallet'
                  : undefined,
            },
          });

          if (paymentMethod === 'WALLET' && !instantFreeCheckout) {
            await this.wallet.debitForOrder(tx, customer.id, finalAmount, currency, created.id);
          }

          if (appliedCoupon) {
            await this.coupons.recordRedemption(
              tx,
              appliedCoupon.id,
              customer.id,
              created.id,
              discountAmount,
            );
          }

          await tx.orderTimelineEvent.create({
            data: { orderId: created.id, status: 'CREATED', message: 'Order created', actor: 'customer' },
          });
          if (instantFreeCheckout) {
            await tx.orderTimelineEvent.create({
              data: {
                orderId: created.id,
                status: 'APPROVED',
                message: isTestProduct ? 'Test product auto-approved' : 'Free test auto-approved',
                actor: 'system',
              },
            });
          } else if (paymentMethod === 'WALLET') {
            await tx.orderTimelineEvent.create({
              data: {
                orderId: created.id,
                status: 'APPROVED',
                message: 'Paid with wallet',
                actor: 'system',
              },
            });
          } else if (hasPayment) {
            await tx.orderTimelineEvent.create({
              data: { orderId: created.id, status: 'PAYMENT_SUBMITTED', message: 'Payment receipt submitted', actor: 'customer' },
            });
            await tx.storeOrder.update({
              where: { id: created.id },
              data: { status: 'UNDER_REVIEW' },
            });
            await tx.orderTimelineEvent.create({
              data: {
                orderId: created.id,
                status: 'UNDER_REVIEW',
                message: scheduleAutoDeliver
                  ? `Awaiting admin review (auto-deliver in ~${delayMinutes} min if unanswered)`
                  : 'Awaiting admin review',
                actor: 'system',
              },
            });
          }

          return created;
        });
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        const code = String(err?.code || '');
        const msg = String(err?.message || '');
        if (code === 'P2002' || /unique constraint/i.test(msg)) {
          this.logger.warn(`Checkout trackingCode collision on attempt ${attempt + 1}; retrying`);
          continue;
        }
        throw err;
      }
    }
    if (lastErr || !order) {
      throw lastErr instanceof Error
        ? lastErr
        : new BadRequestException('Could not create order — please retry');
    }

    void this.events?.emit('order.created', {
      orderId: order.id,
      trackingCode: order.trackingCode,
      paymentMethod,
    });
    await this.recordGatewayPayment(paymentMethod, {
      amount: finalAmount,
      currency,
      orderId: order.id,
    }, 'create');

    let invoiceUrl: string | null = null;
    let starsAmount: number | null = null;
    if (starsPay && this.paymentManagement && !instantFreeCheckout) {
      try {
        const charge = await this.paymentManagement.createStarsCharge({
          adminId: store.adminId,
          surface: payload.isRenewal ? 'renewal' : 'store',
          orderId: order.id,
          amount: finalAmount,
          currency,
          title: String(product.name || store.title || 'HMPanel').slice(0, 32),
          description: String(store.title || 'Payment').slice(0, 255),
          chatId: (payload as { telegramChatId?: string | number }).telegramChatId || null,
        });
        invoiceUrl = charge.invoiceUrl || null;
        starsAmount = charge.starsAmount;
      } catch (err: any) {
        this.logger.warn(`Stars invoice failed for ${order.trackingCode}: ${err?.message || err}`);
        throw new BadRequestException(err?.message || 'Failed to create Telegram Stars invoice');
      }
    }
    if (walletPay && this.paymentManagement && !instantFreeCheckout) {
      const telegramUserId =
        customer.telegramUserId ||
        (payload as { telegramUserId?: string | number }).telegramUserId ||
        (payload as { telegramChatId?: string | number }).telegramChatId;
      try {
        const charge = await this.paymentManagement.createWalletPayCharge({
          adminId: store.adminId,
          surface: payload.isRenewal ? 'renewal' : 'store',
          orderId: order.id,
          amount: finalAmount,
          currency,
          description: String(product.name || store.title || 'HMPanel payment'),
          telegramUserId: telegramUserId as string | number,
        });
        invoiceUrl = charge.payUrl || null;
      } catch (err: any) {
        this.logger.warn(`Wallet Pay order failed for ${order.trackingCode}: ${err?.message || err}`);
        throw new BadRequestException(err?.message || 'Failed to create Telegram Wallet Pay order');
      }
    }

    if (!instantFreeCheckout) {
      try {
        await this.customerNotifications.notifyCustomer(customer.id, {
          type: payload.isRenewal ? 'renewal_submitted' : 'order_submitted',
          title: payload.isRenewal
            ? `🔄 درخواست تمدید ثبت شد${configName && configName !== 'renewal' ? ` — ${configName}` : ''} / Renewal submitted${configName && configName !== 'renewal' ? ` — ${configName}` : ''}`
            : '🛒 سفارش ثبت شد / Order submitted',
          message:
            paymentMethod === 'WALLET'
              ? 'پرداخت با کیف پول انجام شد. / Paid with wallet.'
              : hasPayment
                ? 'رسید دریافت شد — در انتظار بررسی ادمین. / Receipt received — awaiting admin review.'
                : 'سفارش ساخته شد — منتظر جزئیات پرداخت. / Order created — waiting for payment details.',
          payload: {
            orderId: order.id,
            trackingCode: order.trackingCode,
            status: paymentMethod === 'WALLET' ? 'APPROVED' : hasPayment ? 'UNDER_REVIEW' : order.status,
            isRenewal: !!payload.isRenewal,
            configName: configName && configName !== 'renewal' ? configName : null,
            serviceName: product.name,
            kind: 'order_submitted',
          },
          orderId: order.id,
        });
      } catch (err: any) {
        this.logger.warn(
          `Customer notify after checkout failed for ${order.trackingCode}: ${err?.message || err}`,
        );
      }

      void this.telegram
        .notifyAdminNewOrder(store.adminId, order.id)
        .then((ok) => {
          if (!ok) {
            this.logger.warn(
              `Admin Telegram notify skipped/failed for order ${order.id} (bot disabled, no admin chat, or send error)`,
            );
          }
        })
        .catch((err) => {
          this.logger.warn(`Admin Telegram notify failed: ${err?.message || err}`);
        });
    }

    // Wallet-paid or free test SKU: provision immediately
    if (paymentMethod === 'WALLET' || instantFreeCheckout) {
      try {
        await this.provisionOrder(store.adminId, 'ADMIN', order.id);
      } catch (err: any) {
        this.logger.error(
          `${instantFreeCheckout ? 'Free test' : 'Wallet'} order fulfill failed for ${order.trackingCode}: ${err?.message || err}`,
        );
      }
    }

    const fresh = await this.prisma.storeOrder.findUnique({ where: { id: order.id } });

    return {
      orderId: order.id,
      trackingCode: order.trackingCode,
      customerToken: customer.token,
      status:
        paymentMethod === 'WALLET' || instantFreeCheckout
          ? fresh?.status || 'APPROVED'
          : hasPayment
            ? 'UNDER_REVIEW'
            : order.status,
      discountAmount,
      amount: finalAmount,
      invoiceUrl,
      starsAmount,
      paymentMethod,
      profile: {
        name: customer.name,
        telegram: customer.telegram,
        whatsapp: customer.whatsapp,
      },
    };
  }

  private async assertAdminTrafficForOrder(
    adminId: string,
    product: {
      traffic: bigint | number | null;
      profile?: { providerId?: string | null; panelId?: string | null } | null;
    },
  ) {
    const bytes = BigInt(product.traffic || 0);
    if (bytes <= 0n) return;

    if (isEylanProvider(product.profile?.providerId)) {
      await this.eylanAddon.assertQuota(adminId, Number(bytes));
      return;
    }

    const panelId = product.profile?.panelId || null;
    if (!panelId) return;

    const admin = await this.adminQuota.loadAdmin(adminId);
    if (this.adminQuota.skipTrafficAccounting(admin)) return;
    await this.adminQuota.assertCanAllocate(admin, bytes, panelId, {
      usageMode: admin.trafficMode === 'USAGE',
    });
  }

  private async assertTestCheckoutChannel(
    customer: { id: string; telegramUserId?: string | null },
    opts: { sessionToken?: string; requestKey?: string },
  ) {
    if (opts.requestKey?.startsWith('tg:')) {
      if (!customer.telegramUserId) {
        throw new ForbiddenException(
          'Test products require a linked Telegram account / برای تست باید از تلگرام وارد شوید',
        );
      }
      return;
    }

    if (!customer.telegramUserId) {
      throw new ForbiddenException(
        'Test products are only available via Telegram / محصول تست فقط از تلگرام قابل دریافت است',
      );
    }

    if (!opts.sessionToken) {
      throw new ForbiddenException(
        'Test products are only available via Telegram / محصول تست فقط از تلگرام قابل دریافت است',
      );
    }

    const session = await this.customerAuth.validateSessionWithMeta(opts.sessionToken);
    if (session.authChannel !== 'telegram') {
      throw new ForbiddenException(
        'Test products are only available in the Telegram app / محصول تست فقط در مینی‌اپ تلگرام فعال است',
      );
    }
  }

  private async getTestProductEligibility(
    customerId: string,
    product: {
      id: string;
      isTest?: boolean;
      testCooldownoldownDays?: number;
      testCooldownDays?: number;
    },
  ): Promise<{ eligible: boolean; nextAvailableAt?: string }> {
    if (!product.isTest) return { eligible: true };
    const cooldownDays = Math.max(
      1,
      Number(product.testCooldownoldownDays ?? product.testCooldownDays ?? 30),
    );
    const since = new Date(Date.now() - cooldownDays * 86400000);
    const prior = await this.prisma.storeOrder.findFirst({
      where: {
        customerId,
        productId: product.id,
        status: {
          in: ['ACTIVE', 'RENEWED', 'APPROVED', 'PROVISIONING', 'UNDER_REVIEW', 'PAYMENT_SUBMITTED'],
        },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) return { eligible: true };
    const nextAt = new Date(prior.createdAt.getTime() + cooldownDays * 86400000);
    return { eligible: false, nextAvailableAt: nextAt.toISOString() };
  }

  private async assertTestProductAllowed(
    customerId: string,
    product: {
      id: string;
      isTest?: boolean;
      testCooldownoldownDays?: number;
      testCooldownDays?: number;
      adminId?: string;
    },
  ) {
    if (!product.isTest) return;
    const cooldownDays = Math.max(
      1,
      Number(product.testCooldownoldownDays ?? product.testCooldownDays ?? 30),
    );
    const since = new Date(Date.now() - cooldownDays * 86400000);
    const prior = await this.prisma.storeOrder.findFirst({
      where: {
        customerId,
        productId: product.id,
        status: { in: ['ACTIVE', 'RENEWED', 'APPROVED', 'PROVISIONING', 'UNDER_REVIEW', 'PAYMENT_SUBMITTED'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (prior) {
      const nextAt = new Date(prior.createdAt.getTime() + cooldownDays * 86400000);
      throw new BadRequestException(
        `Test already used. Next available: ${nextAt.toISOString().slice(0, 10)}`,
      );
    }
  }

  async createRenewCheckout(token: string, payload: RenewCheckoutPayload, requestKey = token) {
    this.rateLimit.check('renewal', requestKey);
    const payMethod = String(payload.paymentMethod || '').toUpperCase().replace(/[\s-]/g, '_');
    const payWallet = payMethod === 'WALLET';
    const payStars = payMethod === 'TELEGRAM_STARS';
    const payWalletPay = payMethod === 'TELEGRAM_WALLET';
    if (!payWallet && !payStars && !payWalletPay && !(payload.receiptText?.trim() || payload.receiptImage)) {
      throw new BadRequestException(
        'Payment receipt is required for renewals / برای تمدید ارسال رسید الزامی است',
      );
    }
    const customer = await this.customers.getByToken(token);
    if (!customer) throw new NotFoundException('Customer not found');

    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
    });
    if (!store) throw new NotFoundException('Store not found');

    const product = await this.prisma.storeProduct.findFirst({
      where: { id: payload.productId, adminId: customer.adminId, renewable: true, visible: true },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    let clientId = payload.clientId?.trim();
    if (!clientId && payload.subscriptionLink?.trim()) {
      const resolved = await this.provisioning.resolveRenewClientByToken(
        customer.adminId,
        payload.subscriptionLink.trim(),
      );
      clientId = resolved.id;
      await this.linkClientToCustomer(customer.id, resolved.id, product.categoryId);
    }
    if (!clientId) {
      throw new BadRequestException('clientId or subscriptionLink is required');
    }

    const client = await this.provisioning.resolveRenewClient(customer.adminId, clientId);

    await this.assertRenewCategoryCompatible(
      customer.adminId,
      client.id,
      product.categoryId,
      customer.id,
    );

    return this.createCheckout(store.slug, {
      productId: product.id,
      customerToken: token,
      isRenewal: true,
      renewClientId: client.id,
      receiptText: payload.receiptText,
      receiptImage: payload.receiptImage,
      notes: payload.notes,
      currency: payload.currency,
      paymentMethod: payload.paymentMethod,
      couponCode: payload.couponCode,
      selectedAddonIds: payload.selectedAddonIds,
      telegramChatId: payload.telegramChatId,
      telegramUserId: payload.telegramUserId,
    }, requestKey);
  }

  async createRenewCheckoutFromSession(
    sessionToken: string,
    payload: RenewCheckoutPayload,
    requestKey = sessionToken,
  ) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    return this.createRenewCheckout(customer.token, payload, requestKey);
  }

  async createCheckoutFromSession(
    sessionToken: string,
    payload: CheckoutPayload,
    requestKey = sessionToken,
  ) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
    });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    return this.createCheckout(
      store.slug,
      {
        ...payload,
        customerToken: customer.token,
        haveToken: true,
        name: payload.name || customer.name || undefined,
        telegram: payload.telegram || customer.telegram || undefined,
        whatsapp: payload.whatsapp || customer.whatsapp || undefined,
        email: payload.email || customer.email || undefined,
        isRenewal: false,
        customerSessionToken: sessionToken,
      },
      requestKey,
    );
  }

  async trackOrder(code: string, requestKey = code) {
    this.rateLimit.check('tracking', requestKey);
    const normalized = String(code || '').trim().toUpperCase();
    const order = await this.prisma.storeOrder.findUnique({
      where: { trackingCode: normalized },
      include: {
        product: true,
        payment: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        client: { select: { id: true, email: true, subId: true, subToken: true, remark: true } },
        customer: { select: { token: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const allowTokenHandoff =
      !order.isRenewal && Date.now() - order.createdAt.getTime() <= 1000 * 60 * 60 * 24;

    const store = await this.prisma.storeProfile.findUnique({
      where: { id: order.storeId },
      select: { slug: true, title: true, adminId: true, theme: true },
    });

    let delivery: {
      providerId?: string | null;
      subId: string | null;
      subToken: string | null;
      email: string | null;
      remark: string | null;
      subUrl: string | null;
    } | null = null;

    if (order.status === 'ACTIVE' || order.status === 'RENEWED') {
      const ff = parseFulfillment(order.fulfillment);
      const profileProvider =
        (
          await this.prisma.provisioningProfile.findFirst({
            where: { id: order.product.profileId || '__none__' },
            select: { providerId: true },
          })
        )?.providerId || null;
      const eylanOrder =
        isEylanProvider(ff?.providerId) || isEylanProvider(profileProvider);

      if (eylanOrder) {
        const username = String(ff?.username || order.configName || '').trim();
        let subUrl: string | null = isNativeEylanSubUrl(ff?.subUrl)
          ? String(ff!.subUrl).trim()
          : null;
        if (!subUrl && username && store?.adminId) {
          try {
            subUrl = await this.eylanProvider.ensureSubUrl({
              adminId: store.adminId,
              username,
              storedSubUrl: ff?.subUrl,
            });
            if (subUrl) {
              const nextFf = {
                providerId: EYLAN_PROVIDER,
                username,
                subUrl,
                subToken: extractSubTokenFromUrl(subUrl) || ff?.subToken,
                ...(ff?.renewOfOrderId ? { renewOfOrderId: ff.renewOfOrderId } : {}),
              };
              await this.prisma.storeOrder.update({
                where: { id: order.id },
                data: { fulfillment: nextFf as Prisma.InputJsonValue },
              });
            }
          } catch (err) {
            this.logger.warn(
              `Eylan sub URL repair failed for ${order.trackingCode}: ${(err as Error)?.message || err}`,
            );
          }
        }
        delivery = {
          providerId: EYLAN_PROVIDER,
          subId: null,
          subToken: null,
          email: username || null,
          remark: username || null,
          // Never fall back to HMPanel /s/ — empty if native URL unavailable.
          subUrl,
        };
      } else if (order.client) {
        delivery = {
          providerId: PANEL_3XUI_PROVIDER,
          subId: order.client.subId,
          subToken: order.client.subToken,
          email: order.client.email,
          remark: order.client.remark,
          subUrl: null,
        };
      } else if (ff?.subUrl) {
        delivery = {
          providerId: ff.providerId || null,
          subId: ff.subToken || null,
          subToken: ff.subToken || null,
          email: ff.username || order.configName,
          remark: ff.username || order.configName,
          subUrl: ff.subUrl,
        };
      }
    }

    const lastTimeline = order.timeline[order.timeline.length - 1];
    const branding = store ? await this.branding.getBranding(store.adminId) : null;
    const publishedTheme = store
      ? (await this.themes?.resolvePublished(store.theme)) || null
      : null;

    return {
      trackingCode: order.trackingCode,
      status: order.status,
      productName: order.product.name,
      isRenewal: order.isRenewal,
      amount: order.amount,
      currency: order.currency,
      rejectReason: order.rejectReason,
      provisionError: order.provisionError,
      lastTimelineMessage: lastTimeline?.message || null,
      customerToken: allowTokenHandoff ? order.customer.token : undefined,
      timeline: order.timeline,
      delivery,
      storeSlug: store?.slug || null,
      storeTitle: store?.title || branding?.name || null,
      branding: branding
        ? {
            name: branding.name,
            logo: branding.logo,
            logoDark: branding.logoDark,
            primaryColor: branding.primaryColor,
            accentColor: branding.accentColor,
            footerText: branding.footerText,
            theme: branding.theme,
          }
        : null,
      publishedTheme,
    };
  }

  async getCustomerPortal(token: string) {
    return this.buildCustomerDashboard(token);
  }

  listCustomers(
    adminId: string,
    query?: { segment?: string; search?: string },
  ) {
    const segment = query?.segment as
      | 'all'
      | 'new'
      | 'with_service'
      | 'without_service'
      | 'telegram_only'
      | undefined;
    return this.customers.listForAdmin(adminId, {
      segment: segment || 'all',
      search: query?.search,
    });
  }

  getCustomerDetail(adminId: string, customerId: string) {
    return this.customers.getDetail(adminId, customerId);
  }

  setCustomerStatus(adminId: string, customerId: string, status: string) {
    return this.customers.setCustomerStatus(adminId, customerId, status);
  }

  async attachCustomerService(
    adminId: string,
    role: string,
    customerId: string,
    input: { clientId?: string; categoryId?: string },
  ) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const clientId = String(input.clientId || '').trim();
    const categoryId = String(input.categoryId || '').trim();
    if (!clientId) throw new BadRequestException('clientId is required');
    if (!categoryId) throw new BadRequestException('categoryId is required');

    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, adminId },
    });
    if (!category) throw new BadRequestException('Invalid category');

    const detail = await this.customers.getDetail(adminId, customerId);
    const alreadyLinked = !!(detail?.services || []).some(
      (s: { id: string }) => s.id === clientId,
    );

    // Synthetic Eylan / Pasarguard services: category only (no Community Client row).
    if (parseEylanServiceId(clientId) || parsePasarguardServiceId(clientId)) {
      if (!alreadyLinked) {
        throw new BadRequestException('Service is not linked to this customer');
      }
      await this.linkClientToCustomer(customerId, clientId, categoryId);
      await this.unhideCustomerService(customerId, clientId);
      return this.customers.getDetail(adminId, customerId);
    }

    // Already linked 3x-ui service: update category without re-validating ownership.
    if (alreadyLinked) {
      await this.linkClientToCustomer(customerId, clientId, categoryId);
      await this.unhideCustomerService(customerId, clientId);
      return this.customers.getDetail(adminId, customerId);
    }

    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        ...(role === 'SUPER_ADMIN' ? {} : { OR: [{ adminId }, { adminId: null }] }),
      },
      select: { id: true, adminId: true, email: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (!client.adminId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { adminId },
      });
    } else if (client.adminId !== adminId && role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Client belongs to another admin');
    }

    await this.linkClientToCustomer(customerId, client.id, categoryId);
    await this.unhideCustomerService(customerId, client.id);
    return this.customers.getDetail(adminId, customerId);
  }

  async updateCustomerServiceSubscription(
    adminId: string,
    role: string,
    customerId: string,
    clientId: string,
    input: {
      subId?: string;
      remark?: string;
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      notifyTelegram?: boolean;
    },
  ) {
    const detail = await this.customers.getDetail(adminId, customerId);
    if (!detail) throw new NotFoundException('Customer not found');

    const service = (detail.services || []).find((s: { id: string }) => s.id === clientId);
    if (!service) {
      throw new BadRequestException('Service is not linked to this customer');
    }
    if (parseEylanServiceId(clientId) || isEylanProvider((service as { providerId?: string }).providerId)) {
      throw new BadRequestException('Eylan services are managed in Eylan Panel, not Community Clients');
    }
    if (
      parsePasarguardServiceId(clientId) ||
      isPasarguardProvider((service as { providerId?: string }).providerId)
    ) {
      throw new BadRequestException(
        'Pasarguard services are managed in Panel Plus, not Community Clients',
      );
    }

    const nextSubId =
      input.subId !== undefined ? String(input.subId || '').trim() : undefined;
    const changedSub =
      nextSubId !== undefined && nextSubId !== (service.subId || '');

    await this.clientsService.update(clientId, adminId, role, {
      ...(nextSubId !== undefined ? { subId: nextSubId } : {}),
      ...(input.remark !== undefined ? { remark: input.remark } : {}),
      ...(input.enable !== undefined ? { enable: input.enable } : {}),
      ...(input.total !== undefined ? { total: Number(input.total) } : {}),
      ...(input.expiryTime !== undefined ? { expiryTime: Number(input.expiryTime) } : {}),
    });

    const updated = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        email: true,
        remark: true,
        subId: true,
        subToken: true,
        enable: true,
        expiryTime: true,
        total: true,
        up: true,
        down: true,
      },
    });

    const shouldNotify =
      !!input.notifyTelegram &&
      (changedSub || input.remark !== undefined) &&
      !!(detail as { telegramUserId?: string | null }).telegramUserId;

    if (shouldNotify && updated?.subId) {
      await this.customerNotifications.notifyCustomer(customerId, {
        type: 'subscription_updated',
        title: '🔗 لینک سابسکریپشن به‌روز شد / Subscription link updated',
        message:
          'ادمین لینک ساب شما را تغییر داد. از لینک جدید استفاده کنید. / Your admin updated the subscription link. Use the new link below.',
        payload: {
          kind: 'subscription_updated',
          subId: updated.subId,
          serviceName: updated.remark || updated.email,
          configName: updated.remark || updated.email,
          isRenewal: false,
        },
      });
    }

    const now = Date.now();
    const expiryMs = Number(updated?.expiryTime || 0);
    const status = !updated?.enable
      ? 'disabled'
      : expiryMs > 0 && now >= expiryMs
        ? 'expired'
        : 'active';

    return {
      service: updated
        ? {
            ...updated,
            status,
            total: updated.total.toString(),
            up: updated.up.toString(),
            down: updated.down.toString(),
            expiryTime: updated.expiryTime.toString(),
          }
        : null,
      notified: shouldNotify,
      customer: {
        id: detail.id,
        name: detail.name,
        token: detail.token,
        telegramUserId: detail.telegramUserId || null,
      },
    };
  }

  async getAnalytics(
    adminId: string,
    query: {
      range?: '7d' | '30d' | '90d' | '365d';
      groupBy?: 'day' | 'week' | 'month';
      categoryId?: string;
    },
  ) {
    const store = await this.getOrCreateProfile(adminId);
    const range = query.range || '30d';
    const groupBy = query.groupBy || 'day';
    const days =
      range === '7d' ? 7 : range === '90d' ? 90 : range === '365d' ? 365 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const orders = await this.prisma.storeOrder.findMany({
      where: {
        storeId: store.id,
        createdAt: { gte: since },
        status: { in: ['ACTIVE', 'RENEWED'] },
        OR: [{ payment: { is: null } }, { payment: { status: 'APPROVED' } }],
        ...(query.categoryId
          ? { product: { is: { categoryId: query.categoryId } } }
          : {}),
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        createdAt: true,
        isRenewal: true,
        product: {
          select: {
            id: true,
            name: true,
            priceToman: true,
            priceUsd: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const bucketKey = (d: Date) => {
      const x = new Date(d);
      if (groupBy === 'month') {
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
      }
      if (groupBy === 'week') {
        const day = x.getDay();
        const diff = (day + 6) % 7;
        x.setDate(x.getDate() - diff);
        return x.toISOString().slice(0, 10);
      }
      return x.toISOString().slice(0, 10);
    };

    const seriesMap = new Map<
      string,
      { date: string; orders: number; revenueUsd: number; revenueToman: number; renewals: number }
    >();
    const categoryMap = new Map<
      string,
      { id: string; name: string; orders: number; revenueUsd: number; revenueToman: number }
    >();
    const productMap = new Map<
      string,
      { id: string; name: string; orders: number; revenueUsd: number; revenueToman: number }
    >();

    let totalUsd = 0;
    let totalToman = 0;
    let totalOrders = 0;
    let totalRenewals = 0;

    for (const row of orders) {
      const cur = String(row.currency || '').toUpperCase();
      const isTomanCur = ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(cur);
      const productToman = Number(row.product?.priceToman || 0);
      const productUsd = Number(row.product?.priceUsd || 0);
      let n = Number(row.amount || 0);
      if (n === 0) {
        if (isTomanCur || productToman > 0) n = productToman || productUsd;
        else n = productUsd || productToman;
      }
      const usd = isTomanCur || (Number(row.amount || 0) === 0 && productToman > 0) ? 0 : n;
      const toman =
        isTomanCur || (Number(row.amount || 0) === 0 && productToman > 0) ? n : 0;

      totalUsd += usd;
      totalToman += toman;
      totalOrders += 1;
      if (row.isRenewal) totalRenewals += 1;

      const key = bucketKey(row.createdAt);
      const bucket = seriesMap.get(key) || {
        date: key,
        orders: 0,
        revenueUsd: 0,
        revenueToman: 0,
        renewals: 0,
      };
      bucket.orders += 1;
      bucket.revenueUsd += usd;
      bucket.revenueToman += toman;
      if (row.isRenewal) bucket.renewals += 1;
      seriesMap.set(key, bucket);

      const catId = row.product?.categoryId || 'uncategorized';
      const catName = row.product?.category?.name || 'Uncategorized';
      const cat = categoryMap.get(catId) || {
        id: catId,
        name: catName,
        orders: 0,
        revenueUsd: 0,
        revenueToman: 0,
      };
      cat.orders += 1;
      cat.revenueUsd += usd;
      cat.revenueToman += toman;
      categoryMap.set(catId, cat);

      const prodId = row.product?.id || 'unknown';
      const prodName = row.product?.name || 'Unknown';
      const prod = productMap.get(prodId) || {
        id: prodId,
        name: prodName,
        orders: 0,
        revenueUsd: 0,
        revenueToman: 0,
      };
      prod.orders += 1;
      prod.revenueUsd += usd;
      prod.revenueToman += toman;
      productMap.set(prodId, prod);
    }

    const series = [...seriesMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const byCategory = [...categoryMap.values()].sort((a, b) => b.revenueUsd + b.revenueToman - (a.revenueUsd + a.revenueToman));
    const byProduct = [...productMap.values()].sort((a, b) => b.revenueUsd + b.revenueToman - (a.revenueUsd + a.revenueToman));

    return {
      range,
      groupBy,
      since: since.toISOString(),
      totals: {
        orders: totalOrders,
        renewals: totalRenewals,
        revenueUsd: totalUsd,
        revenueToman: totalToman,
      },
      series,
      byCategory,
      byProduct: byProduct.slice(0, 12),
    };
  }
}
