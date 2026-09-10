import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { telegramGetJson, telegramPostJson } from './telegram-bot-api';
import { PaymentLedgerService } from './payment-ledger.service';
import { DomainEventBusService } from '../events/domain-event-bus.service';
import { PAYMENT_SURFACE_SETTING_KEY, type PaymentSurface } from './payment-surface';
import {
  cardIsUsable,
  newPaymentBankCard,
  normalizePaymentBankCard,
  normalizePaymentBankCards,
  pickAssignedCards,
  type PaymentBankCard,
} from './payment-cards';
import {
  applyCardTitles,
  defaultPaymentManagementState,
  migratePaymentManagementState,
  parsePaymentManagementState,
  paymentManagementSettingKey,
  snapshotMethods,
  surfaceLabel,
  type PaymentManagementState,
  type TelegramStarsPluginSettings,
  type WalletPayPluginSettings,
} from './payment-management.state';
import {
  amountToStars,
  decodeStarsPayload,
  encodeStarsPayload,
  ledgerIdempotencyKey,
} from './telegram-stars.util';
import {
  WALLET_PAY_API_BASE,
  WALLET_PAY_GATEWAY,
  amountToWalletPay,
  clampWalletPayDescription,
  decodeWalletPayCustomData,
  encodeWalletPayCustomData,
  parseTelegramUserId,
  parseWalletPayWebhookEvents,
  verifyWalletPayWebhook,
  walletPayExternalId,
  walletPayWebhookPathCandidates,
  walletPayWebhookPathForAdmin,
} from './telegram-wallet.util';
import { isImplementedGateway } from './payment-catalog';

export type CheckoutPaymentResolution = {
  gateways: string[];
  default: string;
  cardId: string | null;
  cards: PaymentBankCard[];
  assignmentEnabled: boolean;
  methods: ReturnType<typeof snapshotMethods>;
};

@Injectable()
export class PaymentManagementService {
  private readonly logger = new Logger(PaymentManagementService.name);

  constructor(
    private prisma: PrismaService,
    private ledger: PaymentLedgerService,
    private registry: PaymentGatewayRegistry,
    @Optional() private settings?: SettingsService,
    @Optional() private events?: DomainEventBusService,
  ) {}

  private encryptionKey() {
    const secret =
      process.env.TELEGRAM_TOKEN_SECRET || process.env.JWT_SECRET || 'hmpanel-dev-secret';
    return createHash('sha256').update(secret).digest();
  }

  private async platformBotToken(): Promise<string | null> {
    try {
      if (this.settings) {
        const value = await this.settings.getSetting('telegram_bot_token', '');
        const token = String(value || '').trim();
        if (token) return token;
      }
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: 'telegram_bot_token' },
      });
      if (!row?.value) return null;
      try {
        const parsed = JSON.parse(row.value);
        return String(parsed || '').trim() || null;
      } catch {
        return String(row.value).trim() || null;
      }
    } catch {
      return null;
    }
  }

  encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
  }

  decryptBotToken(payload?: string | null): string | null {
    if (!payload) return null;
    if (!payload.startsWith('v1:')) return payload;
    const [, ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivB64, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  maskToken(token?: string | null): string | null {
    const value = String(token || '').trim();
    if (!value) return null;
    if (value.length < 10) return '••••';
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }

  async loadState(adminId: string): Promise<PaymentManagementState> {
    const key = paymentManagementSettingKey(adminId);
    let parsed: unknown = null;
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      if (row?.value) {
        try {
          parsed = JSON.parse(row.value);
        } catch {
          parsed = null;
        }
      }
    } catch (err: any) {
      this.logger.warn(`loadState failed: ${err?.message || err}`);
    }
    return parsePaymentManagementState(parsed);
  }

  private async saveState(adminId: string, state: PaymentManagementState): Promise<PaymentManagementState> {
    const next: PaymentManagementState = {
      ...state,
      cards: applyCardTitles(state.cards),
      initialized: true,
    };
    const key = paymentManagementSettingKey(adminId);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(next) },
      create: { key, value: JSON.stringify(next) },
    });
    try {
      await this.prisma.systemSetting.upsert({
        where: { key: PAYMENT_SURFACE_SETTING_KEY },
        update: { value: JSON.stringify(next.assignments) },
        create: { key: PAYMENT_SURFACE_SETTING_KEY, value: JSON.stringify(next.assignments) },
      });
    } catch (err: any) {
      this.logger.warn(`sync surface assignments failed: ${err?.message || err}`);
    }
    await this.syncLegacyDestinations(adminId, next);
    return next;
  }

  async ensureMigrated(adminId: string): Promise<PaymentManagementState> {
    const current = await this.loadState(adminId);
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: {
        paymentConfig: true,
        bankName: true,
        bankCardNumber: true,
        bankCardHolder: true,
        bankIban: true,
        paymentInstructions: true,
      },
    });
    let rechargeCards: unknown = [];
    let rechargeManual = true;
    let isSuper = false;
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { id: adminId },
        select: { role: true },
      });
      isSuper = admin?.role === 'SUPER_ADMIN';
    } catch {
      /* ignore */
    }
    try {
      if (isSuper) {
        const recharge = await this.prisma.premiumModuleState.findUnique({
          where: { moduleId: 'admin-recharge' },
        });
        const settings =
          recharge?.settings && typeof recharge.settings === 'object'
            ? (recharge.settings as Record<string, unknown>)
            : {};
        rechargeCards = settings.cards;
        rechargeManual = (settings.methods as { manual_bank?: boolean } | undefined)?.manual_bank !== false;
      }
    } catch {
      /* community-only */
    }
    const storeCfg =
      store?.paymentConfig && typeof store.paymentConfig === 'object'
        ? (store.paymentConfig as Record<string, unknown>)
        : {};
    const storeCards = Array.isArray(storeCfg.cards)
      ? storeCfg.cards
      : store?.bankCardNumber
        ? [
            {
              id: 'legacy_store',
              bankName: store.bankName,
              cardNumber: store.bankCardNumber,
              cardHolder: store.bankCardHolder,
              iban: store.bankIban,
              instructions: store.paymentInstructions,
              enabled: true,
            },
          ]
        : [];
    const migrated = migratePaymentManagementState(current, {
      storeCards,
      storeManualBankEnabled: (storeCfg.methods as { manual_bank?: boolean } | undefined)?.manual_bank !== false,
      rechargeCards,
      rechargeManualBankEnabled: rechargeManual,
    });
    if (!current.initialized || (!current.cards.length && migrated.cards.length)) {
      return this.saveState(adminId, migrated);
    }
    return current;
  }

  private async syncLegacyDestinations(adminId: string, state: PaymentManagementState) {
    const cards = state.cards;
    const primary = cards.find((c) => c.enabled !== false) || cards[0];
    try {
      const store = await this.prisma.storeProfile.findUnique({
        where: { adminId },
        select: { id: true, paymentConfig: true },
      });
      if (store) {
        const prev =
          store.paymentConfig && typeof store.paymentConfig === 'object'
            ? (store.paymentConfig as Record<string, unknown>)
            : {};
        const methods = {
          ...((prev.methods as object) || {}),
          manual_bank: state.methods.manual_bank?.enabled !== false,
        };
        await this.prisma.storeProfile.update({
          where: { adminId },
          data: {
            paymentConfig: { ...prev, methods, cards } as any,
            bankName: primary?.bankName || '',
            bankCardNumber: primary?.cardNumber || '',
            bankCardHolder: primary?.cardHolder || '',
            bankIban: primary?.iban || '',
            paymentInstructions: primary?.instructions || '',
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`sync store paymentConfig failed: ${err?.message || err}`);
    }
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { id: adminId },
        select: { role: true },
      });
      if (admin?.role !== 'SUPER_ADMIN') return;
      const recharge = await this.prisma.premiumModuleState.findUnique({
        where: { moduleId: 'admin-recharge' },
      });
      if (recharge) {
        const prev =
          recharge.settings && typeof recharge.settings === 'object'
            ? (recharge.settings as Record<string, unknown>)
            : {};
        const methods = {
          ...((prev.methods as object) || {}),
          manual_bank: state.methods.manual_bank?.enabled !== false,
        };
        await this.prisma.premiumModuleState.update({
          where: { moduleId: 'admin-recharge' },
          data: { settings: { ...prev, methods, cards } as any },
        });
      }
    } catch (err: any) {
      this.logger.warn(`sync recharge cards failed: ${err?.message || err}`);
    }
  }

  async starsConnection(adminId: string, binding?: 'store' | 'platform') {
    const state = await this.ensureMigrated(adminId);
    const use = binding || state.stars.botBinding;
    let token: string | null = null;
    let source: 'store' | 'platform' = use;
    if (use === 'store') {
      const store = await this.prisma.storeProfile.findUnique({
        where: { adminId },
        select: { telegramBotTokenEnc: true, telegramBotUsername: true, telegramBotEnabled: true },
      });
      token = this.decryptBotToken(store?.telegramBotTokenEnc);
      if (!token) {
        token = await this.platformBotToken();
        if (token) source = 'platform';
      }
      return {
        source,
        configured: !!token,
        enabled: !!store?.telegramBotEnabled,
        username: store?.telegramBotUsername || null,
        tokenMasked: this.maskToken(token),
        token,
      };
    }
    token = await this.platformBotToken();
    return {
      source: 'platform' as const,
      configured: !!token,
      enabled: !!token,
      username: null as string | null,
      tokenMasked: this.maskToken(token),
      token,
    };
  }

  async probeStars(adminId: string) {
    const state = await this.ensureMigrated(adminId);
    const conn = await this.starsConnection(adminId, state.stars.botBinding);
    if (!conn.token) {
      const lastProbe = {
        ok: false,
        username: null,
        error: 'Bot token is not configured',
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, stars: { ...state.stars, lastProbe } });
      return { ...lastProbe, tokenMasked: null };
    }
    try {
      const data = await telegramGetJson(conn.token, 'getMe', 12_000);
      const ok = data?.ok === true;
      const username = data?.result?.username ? String(data.result.username) : null;
      const lastProbe = {
        ok,
        username,
        error: ok ? null : String(data?.description || 'getMe failed'),
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, stars: { ...state.stars, lastProbe } });
      return { ...lastProbe, tokenMasked: conn.tokenMasked };
    } catch (err: any) {
      const lastProbe = {
        ok: false,
        username: null,
        error: String(err?.message || err),
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, stars: { ...state.stars, lastProbe } });
      return { ...lastProbe, tokenMasked: conn.tokenMasked };
    }
  }

  async dashboard(adminId: string, role: string) {
    const state = await this.ensureMigrated(adminId);
    const conn = await this.starsConnection(adminId);
    const methods = snapshotMethods(state, {
      starsConfigured: conn.configured,
      cardsConfigured: state.cards.some(cardIsUsable),
      walletPayConfigured: !!this.decryptBotToken(state.walletPay.apiTokenEnc),
    });
    const transactions = await this.ledger.list(adminId, 40);
    const assignments = state.assignments.map((row) => {
      const card = row.cardId ? state.cards.find((c) => c.id === row.cardId) : null;
      const cardIndex = card ? state.cards.findIndex((c) => c.id === card.id) : -1;
      return {
        ...row,
        label: surfaceLabel(row.surface),
        cardTitle: card ? card.title || `Card ${cardIndex + 1}` : null,
        cardIndex: cardIndex >= 0 ? cardIndex + 1 : null,
        summary: this.assignmentSummary(row.allowedGatewayIds, card, cardIndex),
      };
    });
    return {
      methods,
      cards: state.cards,
      assignments,
      transactions,
      settings: {
        stars: {
          ...state.stars,
          tokenMasked: conn.tokenMasked,
          connection: {
            ok: state.stars.lastProbe?.ok === true,
            configured: conn.configured,
            source: conn.source,
            username: state.stars.lastProbe?.username || conn.username,
            enabled: conn.enabled,
          },
        },
        walletPay: this.publicWalletPaySettings(adminId, state),
      },
      role,
      surfaces:
        role === 'SUPER_ADMIN'
          ? (['store', 'add_balance', 'renewal'] as PaymentSurface[])
          : (['store', 'renewal'] as PaymentSurface[]),
    };
  }

  private assignmentSummary(
    gatewayIds: string[],
    card: PaymentBankCard | undefined | null,
    cardIndex: number,
  ): string {
    const labels = gatewayIds.map((id) => {
      if (id === 'manual_bank') {
        const n = cardIndex >= 0 ? ` / Card #${cardIndex + 1}` : '';
        return `Card to Card${n}`;
      }
      if (id === 'telegram_stars') return 'Telegram Stars';
      if (id === 'telegram_wallet') return 'Telegram Wallet Pay';
      if (id === 'wallet') return 'Wallet';
      if (id === 'crypto_gateway') return 'Crypto Gateway';
      if (id === 'rial_gateway') return 'Online Gateway';
      return id;
    });
    return labels.join(' + ') || '—';
  }

  async updateMethods(
    adminId: string,
    patch: Partial<Record<string, { enabled?: boolean } | boolean>>,
  ) {
    const state = await this.ensureMigrated(adminId);
    const methods = { ...state.methods };
    for (const [id, value] of Object.entries(patch || {})) {
      if (!(id in methods)) continue;
      const enabled =
        typeof value === 'boolean'
          ? value
          : value && typeof value === 'object'
            ? value.enabled !== false
            : methods[id as keyof typeof methods].enabled;
      methods[id as keyof typeof methods] = { enabled };
    }
    const stars = {
      ...state.stars,
      enabled: methods.telegram_stars.enabled,
    };
    const walletPay = {
      ...state.walletPay,
      enabled: methods.telegram_wallet.enabled,
    };
    return this.saveState(adminId, { ...state, methods, stars, walletPay });
  }

  async updateStarsSettings(adminId: string, patch: Partial<TelegramStarsPluginSettings>) {
    const state = await this.ensureMigrated(adminId);
    const stars: TelegramStarsPluginSettings = {
      ...state.stars,
      ...patch,
      botBinding: patch.botBinding === 'platform' ? 'platform' : patch.botBinding === 'store' ? 'store' : state.stars.botBinding,
      lastProbe: state.stars.lastProbe,
    };
    const methods = {
      ...state.methods,
      telegram_stars: { enabled: stars.enabled },
    };
    return this.saveState(adminId, { ...state, stars, methods });
  }

  private publicWalletPaySettings(adminId: string, state: PaymentManagementState) {
    const token = this.decryptBotToken(state.walletPay.apiTokenEnc);
    return {
      enabled: state.walletPay.enabled,
      pricingCurrency: state.walletPay.pricingCurrency,
      autoConversionCurrency: state.walletPay.autoConversionCurrency,
      tomanPerUsd: state.walletPay.tomanPerUsd,
      timeoutSeconds: state.walletPay.timeoutSeconds,
      tokenSet: !!token,
      tokenMasked: this.maskToken(token),
      webhookPath: walletPayWebhookPathForAdmin(adminId),
      lastProbe: state.walletPay.lastProbe || null,
      connection: {
        ok: state.walletPay.lastProbe?.ok === true,
        configured: !!token,
      },
    };
  }

  async updateWalletPaySettings(
    adminId: string,
    patch: Partial<WalletPayPluginSettings> & { apiToken?: string | null },
  ) {
    const state = await this.ensureMigrated(adminId);
    let apiTokenEnc = state.walletPay.apiTokenEnc;
    if (Object.prototype.hasOwnProperty.call(patch, 'apiToken')) {
      const next = String(patch.apiToken || '').trim();
      apiTokenEnc = next ? this.encryptSecret(next) : null;
    }
    const pricing = String(patch.pricingCurrency || state.walletPay.pricingCurrency).toUpperCase();
    const conversion = String(
      patch.autoConversionCurrency === undefined
        ? state.walletPay.autoConversionCurrency
        : patch.autoConversionCurrency || '',
    ).toUpperCase();
    const walletPay: WalletPayPluginSettings = {
      ...state.walletPay,
      enabled: patch.enabled ?? state.walletPay.enabled,
      apiTokenEnc,
      pricingCurrency: pricing === 'EUR' ? 'EUR' : 'USD',
      autoConversionCurrency:
        conversion === 'USDT' || conversion === 'TON' || conversion === 'BTC' || conversion === 'NOT'
          ? conversion
          : '',
      tomanPerUsd:
        patch.tomanPerUsd != null && Number(patch.tomanPerUsd) > 0
          ? Number(patch.tomanPerUsd)
          : state.walletPay.tomanPerUsd,
      timeoutSeconds:
        patch.timeoutSeconds != null && Number(patch.timeoutSeconds) >= 30
          ? Math.min(86_400, Math.round(Number(patch.timeoutSeconds)))
          : state.walletPay.timeoutSeconds,
      lastProbe: state.walletPay.lastProbe,
    };
    const methods = {
      ...state.methods,
      telegram_wallet: { enabled: walletPay.enabled },
    };
    const saved = await this.saveState(adminId, { ...state, walletPay, methods });
    return this.publicWalletPaySettings(adminId, saved);
  }

  async probeWalletPay(adminId: string) {
    const state = await this.ensureMigrated(adminId);
    const token = this.decryptBotToken(state.walletPay.apiTokenEnc);
    if (!token) {
      const lastProbe = {
        ok: false,
        error: 'Wallet Pay API token is not configured',
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, walletPay: { ...state.walletPay, lastProbe } });
      return { ...lastProbe, tokenMasked: null };
    }
    try {
      const { data, status } = await axios.get(
        `${WALLET_PAY_API_BASE}/wpay/store-api/v1/reconciliation/order-list`,
        {
          params: { offset: 0, count: 1 },
          headers: { 'Wpay-Store-Api-Key': token, Accept: 'application/json' },
          timeout: 15_000,
          validateStatus: () => true,
        },
      );
      const ok = status >= 200 && status < 300 && String(data?.status || 'SUCCESS').toUpperCase() !== 'FAIL';
      const lastProbe = {
        ok,
        error: ok ? null : String(data?.message || data?.status || `HTTP ${status}`),
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, walletPay: { ...state.walletPay, lastProbe } });
      return { ...lastProbe, tokenMasked: this.maskToken(token) };
    } catch (err: any) {
      const lastProbe = {
        ok: false,
        error: String(err?.message || err),
        at: new Date().toISOString(),
      };
      await this.saveState(adminId, { ...state, walletPay: { ...state.walletPay, lastProbe } });
      return { ...lastProbe, tokenMasked: this.maskToken(token) };
    }
  }

  async saveCards(adminId: string, cards: unknown) {
    const state = await this.ensureMigrated(adminId);
    return this.saveState(adminId, { ...state, cards: applyCardTitles(normalizePaymentBankCards(cards)) });
  }

  async upsertCard(adminId: string, patch: Partial<PaymentBankCard> & { id?: string }) {
    const state = await this.ensureMigrated(adminId);
    if (patch.id) {
      const idx = state.cards.findIndex((c) => c.id === patch.id);
      if (idx === -1) throw new BadRequestException('Card not found');
      const next = [...state.cards];
      const merged = normalizePaymentBankCard({ ...next[idx], ...patch });
      if (!merged) throw new BadRequestException('Invalid card');
      next[idx] = merged;
      return this.saveState(adminId, { ...state, cards: applyCardTitles(next) });
    }
    const created = newPaymentBankCard(patch);
    return this.saveState(adminId, {
      ...state,
      cards: applyCardTitles([...state.cards, created]),
    });
  }

  async deleteCard(adminId: string, cardId: string) {
    const state = await this.ensureMigrated(adminId);
    const cards = state.cards.filter((c) => c.id !== cardId);
    const assignments = state.assignments.map((row) =>
      row.cardId === cardId ? { ...row, cardId: cards[0]?.id || null } : row,
    );
    return this.saveState(adminId, { ...state, cards, assignments });
  }

  async saveAssignments(
    adminId: string,
    rows: Array<{
      surface: PaymentSurface;
      allowedGatewayIds: string[];
      defaultId: string;
      cardId?: string | null;
    }>,
  ) {
    const state = await this.ensureMigrated(adminId);
    const bySurface = new Map(state.assignments.map((r) => [r.surface, r]));
    for (const row of rows || []) {
      if (!bySurface.has(row.surface)) continue;
      const allowed = (row.allowedGatewayIds || []).map(String).filter(Boolean);
      const defaultId = allowed.includes(row.defaultId) ? row.defaultId : allowed[0] || '';
      const cardId =
        row.cardId && state.cards.some((c) => c.id === row.cardId) ? row.cardId : row.cardId === null ? null : bySurface.get(row.surface)!.cardId;
      bySurface.set(row.surface, {
        surface: row.surface,
        allowedGatewayIds: allowed,
        defaultId,
        cardId: cardId || null,
      });
    }
    return this.saveState(adminId, { ...state, assignments: [...bySurface.values()] });
  }

  async resolveCheckoutForSurface(
    actingAdminId: string,
    surface: PaymentSurface,
  ): Promise<CheckoutPaymentResolution> {
    let adminId = actingAdminId;
    if (surface === 'add_balance') {
      try {
        const superAdmin = await this.prisma.admin.findFirst({
          where: { role: 'SUPER_ADMIN' },
          select: { id: true },
        });
        if (superAdmin?.id) adminId = superAdmin.id;
      } catch {
        /* keep acting admin */
      }
    }
    return this.resolveCheckout(adminId, surface);
  }

  methodEnabled(state: PaymentManagementState, id: string): boolean {
    const methods = state.methods as Record<string, { enabled: boolean }>;
    if (id === 'telegram_stars') return methods.telegram_stars?.enabled === true && state.stars.enabled;
    if (id === 'telegram_wallet') {
      return (
        methods.telegram_wallet?.enabled === true &&
        state.walletPay.enabled &&
        !!this.decryptBotToken(state.walletPay.apiTokenEnc)
      );
    }
    if (id === 'manual_bank') return methods.manual_bank?.enabled !== false;
    if (id === 'wallet') return methods.wallet?.enabled !== false;
    return false;
  }

  async resolveCheckout(adminId: string, surface: PaymentSurface): Promise<CheckoutPaymentResolution> {
    const state = await this.ensureMigrated(adminId);
    const assignment = state.assignments.find((a) => a.surface === surface) || state.assignments[0];
    const registered = this.registry.list();
    const allowed = (assignment?.allowedGatewayIds || []).filter((id) => {
      if (!this.methodEnabled(state, id)) return false;
      if (!isImplementedGateway(id)) return false;
      if (registered.length && id === 'telegram_stars' && !registered.includes('telegram_stars')) {
        return false;
      }
      if (registered.length && id === 'telegram_wallet' && !registered.includes('telegram_wallet')) {
        return false;
      }
      return true;
    });
    const gateways = allowed.length ? allowed : ['manual_bank', 'wallet'].filter((id) => this.methodEnabled(state, id));
    const defaultId = gateways.includes(assignment?.defaultId || '')
      ? assignment!.defaultId
      : gateways[0] || 'manual_bank';
    const cards = gateways.includes('manual_bank')
      ? pickAssignedCards(state.cards, assignment?.cardId).filter(cardIsUsable)
      : [];
    const conn = await this.starsConnection(adminId);
    return {
      gateways,
      default: defaultId,
      cardId: assignment?.cardId || null,
      cards,
      assignmentEnabled: true,
      methods: snapshotMethods(state, {
        starsConfigured: conn.configured,
        cardsConfigured: state.cards.some(cardIsUsable),
        walletPayConfigured: !!this.decryptBotToken(state.walletPay.apiTokenEnc),
      }),
    };
  }

  async importStoreCards(adminId: string, cards: unknown) {
    const state = await this.ensureMigrated(adminId);
    const incoming = normalizePaymentBankCards(cards);
    if (!incoming.length) return state;
    const byNumber = new Map(state.cards.map((c) => [c.cardNumber || c.id, c]));
    for (const card of incoming) {
      const key = card.cardNumber || card.id;
      const prev = byNumber.get(key);
      byNumber.set(key, prev ? { ...prev, ...card, id: prev.id } : card);
    }
    return this.saveState(adminId, { ...state, cards: applyCardTitles([...byNumber.values()]) });
  }

  async createStarsCharge(input: {
    adminId: string;
    surface: PaymentSurface;
    orderId: string;
    amount: number;
    currency: string;
    title?: string;
    description?: string;
    chatId?: string | number | null;
  }): Promise<{
    ledgerId: string;
    payload: string;
    starsAmount: number;
    invoiceUrl?: string | null;
    duplicate: boolean;
  }> {
    const state = await this.ensureMigrated(input.adminId);
    if (!state.stars.enabled || !state.methods.telegram_stars.enabled) {
      throw new BadRequestException('Telegram Stars is disabled');
    }
    const checkout = await this.resolveCheckout(input.adminId, input.surface);
    if (!checkout.gateways.includes('telegram_stars')) {
      throw new BadRequestException('Telegram Stars is not assigned to this surface');
    }
    const conn = await this.starsConnection(input.adminId);
    if (!conn.token) {
      throw new BadRequestException('Telegram bot is not connected for Stars');
    }
    const starsAmount = amountToStars(input.amount, input.currency, state.stars);
    const payload = encodeStarsPayload(input.surface, input.orderId);
    const idempotencyKey = ledgerIdempotencyKey('telegram_stars', input.surface, input.orderId);
    const { row, created } = await this.ledger.createPending({
      adminId: input.adminId,
      gateway: 'telegram_stars',
      surface: input.surface,
      orderId: input.orderId,
      idempotencyKey,
      amount: starsAmount,
      currency: 'XTR',
      metadata: {
        payload,
        orderAmount: input.amount,
        orderCurrency: input.currency,
      },
    });
    if (row.status === 'paid') {
      return { ledgerId: row.id, payload, starsAmount, invoiceUrl: null, duplicate: true };
    }
    let invoiceUrl: string | null = null;
    const title = (input.title || state.stars.invoiceTitle || 'HMPanel').slice(0, 32);
    const description = (input.description || state.stars.invoiceDescription || 'Payment').slice(0, 255);
    const prices = [{ label: title, amount: starsAmount }];
    try {
      if (input.chatId != null && String(input.chatId)) {
        await telegramPostJson(
          conn.token,
          'sendInvoice',
          {
            chat_id: input.chatId,
            title,
            description,
            payload,
            currency: 'XTR',
            prices,
            provider_token: '',
          },
          15_000,
        );
      } else {
        const link = await telegramPostJson(
          conn.token,
          'createInvoiceLink',
          {
            title,
            description,
            payload,
            currency: 'XTR',
            prices,
            provider_token: '',
          },
          15_000,
        );
        invoiceUrl = link?.result ? String(link.result) : null;
      }
    } catch (err: any) {
      this.logger.warn(`Stars invoice failed: ${err?.message || err}`);
      throw new BadRequestException(err?.message || 'Failed to create Telegram Stars invoice');
    }
    void created;
    return { ledgerId: row.id, payload, starsAmount, invoiceUrl, duplicate: false };
  }

  async answerPreCheckout(input: {
    adminId: string;
    botToken: string;
    queryId: string;
    payload: string;
    currency: string;
    totalAmount: number;
  }): Promise<{ ok: boolean }> {
    const decoded = decodeStarsPayload(input.payload);
    if (!decoded) {
      await this.answerPreCheckoutQuery(input.botToken, input.queryId, false, 'Invalid payment');
      return { ok: false };
    }
    const idempotencyKey = ledgerIdempotencyKey('telegram_stars', decoded.surface, decoded.orderId);
    const row = await this.ledger.findByIdempotency(idempotencyKey);
    if (!row || row.status === 'cancelled' || row.status === 'failed') {
      await this.answerPreCheckoutQuery(input.botToken, input.queryId, false, 'Order not found');
      return { ok: false };
    }
    if (row.status === 'paid') {
      await this.answerPreCheckoutQuery(input.botToken, input.queryId, false, 'Already paid');
      return { ok: false };
    }
    if (String(input.currency || '').toUpperCase() !== 'XTR' || Number(input.totalAmount) !== Number(row.amount)) {
      await this.answerPreCheckoutQuery(input.botToken, input.queryId, false, 'Amount mismatch');
      return { ok: false };
    }
    await this.answerPreCheckoutQuery(input.botToken, input.queryId, true);
    return { ok: true };
  }

  private async answerPreCheckoutQuery(
    botToken: string,
    queryId: string,
    ok: boolean,
    errorMessage?: string,
  ) {
    await telegramPostJson(
      botToken,
      'answerPreCheckoutQuery',
      ok
        ? { pre_checkout_query_id: queryId, ok: true }
        : { pre_checkout_query_id: queryId, ok: false, error_message: (errorMessage || 'Rejected').slice(0, 200) },
      8_000,
    );
  }

  async completeStarsPayment(input: {
    payload: string;
    telegramPaymentChargeId: string;
    totalAmount?: number;
    currency?: string;
    telegramUserId?: string | number;
  }): Promise<{
    duplicate: boolean;
    orderId: string;
    surface: string;
    adminId: string;
    alreadyPaid: boolean;
  }> {
    const decoded = decodeStarsPayload(input.payload);
    if (!decoded) throw new BadRequestException('Invalid Stars payload');
    const chargeId = String(input.telegramPaymentChargeId || '').trim();
    if (!chargeId) throw new BadRequestException('Missing telegram_payment_charge_id');
    const idempotencyKey = ledgerIdempotencyKey('telegram_stars', decoded.surface, decoded.orderId);
    const existing = await this.ledger.findByIdempotency(idempotencyKey);
    if (!existing) throw new BadRequestException('Payment is not registered');
    if (input.currency && String(input.currency).toUpperCase() !== 'XTR') {
      throw new BadRequestException('Unexpected Stars currency');
    }
    if (input.totalAmount != null && Number(input.totalAmount) !== Number(existing.amount)) {
      throw new BadRequestException('Stars amount mismatch');
    }
    const { row, duplicate } = await this.ledger.markPaid({
      idempotencyKey,
      providerChargeId: chargeId,
      metadata: {
        telegramUserId: input.telegramUserId != null ? String(input.telegramUserId) : null,
      },
    });
    return {
      duplicate,
      alreadyPaid: duplicate || row.status === 'paid',
      orderId: decoded.orderId,
      surface: decoded.surface,
      adminId: row.adminId,
    };
  }

  async createWalletPayCharge(input: {
    adminId: string;
    surface: PaymentSurface;
    orderId: string;
    amount: number;
    currency: string;
    description?: string;
    telegramUserId: string | number;
    returnUrl?: string | null;
  }): Promise<{
    ledgerId: string;
    walletOrderId: string | null;
    payUrl: string | null;
    amount: string;
    currencyCode: string;
    duplicate: boolean;
  }> {
    const telegramUserId = parseTelegramUserId(input.telegramUserId);
    if (!telegramUserId) {
      throw new BadRequestException(
        'Telegram Wallet Pay requires a numeric Telegram user id / پرداخت ولت تلگرام به شناسه تلگرام نیاز دارد',
      );
    }
    const state = await this.ensureMigrated(input.adminId);
    if (!state.walletPay.enabled || !state.methods.telegram_wallet.enabled) {
      throw new BadRequestException('Telegram Wallet Pay is disabled');
    }
    const checkout = await this.resolveCheckout(input.adminId, input.surface);
    if (!checkout.gateways.includes('telegram_wallet')) {
      throw new BadRequestException('Telegram Wallet Pay is not assigned to this surface');
    }
    const apiKey = this.decryptBotToken(state.walletPay.apiTokenEnc);
    if (!apiKey) {
      throw new BadRequestException('Wallet Pay API token is not configured');
    }
    const priced = amountToWalletPay(input.amount, input.currency, {
      tomanPerUsd: state.walletPay.tomanPerUsd,
      pricingCurrency: state.walletPay.pricingCurrency,
    });
    const externalId = walletPayExternalId(input.surface, input.orderId);
    const customData = encodeWalletPayCustomData(input.surface, input.orderId);
    const idempotencyKey = ledgerIdempotencyKey(WALLET_PAY_GATEWAY, input.surface, input.orderId);
    const { row } = await this.ledger.createPending({
      adminId: input.adminId,
      gateway: WALLET_PAY_GATEWAY,
      surface: input.surface,
      orderId: input.orderId,
      idempotencyKey,
      amount: priced.amountNumber,
      currency: priced.currencyCode,
      metadata: {
        customData,
        externalId,
        orderAmount: input.amount,
        orderCurrency: input.currency,
        telegramUserId: String(telegramUserId),
      },
    });
    const existingPayUrl = row.metadata && typeof row.metadata.payUrl === 'string' ? String(row.metadata.payUrl) : null;
    const existingWalletOrderId =
      row.metadata && typeof row.metadata.walletOrderId === 'string' ? String(row.metadata.walletOrderId) : null;
    if (row.status === 'paid') {
      return {
        ledgerId: row.id,
        walletOrderId: existingWalletOrderId,
        payUrl: existingPayUrl,
        amount: priced.amount,
        currencyCode: priced.currencyCode,
        duplicate: true,
      };
    }
    if (existingPayUrl) {
      return {
        ledgerId: row.id,
        walletOrderId: existingWalletOrderId,
        payUrl: existingPayUrl,
        amount: priced.amount,
        currencyCode: priced.currencyCode,
        duplicate: false,
      };
    }
    const body: Record<string, unknown> = {
      amount: { currencyCode: priced.currencyCode, amount: priced.amount },
      description: clampWalletPayDescription(input.description),
      externalId,
      timeoutSeconds: state.walletPay.timeoutSeconds,
      customerTelegramUserId: telegramUserId,
      customData,
    };
    if (state.walletPay.autoConversionCurrency) {
      body.autoConversionCurrency = state.walletPay.autoConversionCurrency;
    }
    if (input.returnUrl) body.returnUrl = String(input.returnUrl);
    try {
      const { data, status } = await axios.post(`${WALLET_PAY_API_BASE}/wpay/store-api/v1/order`, body, {
        headers: {
          'Wpay-Store-Api-Key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 20_000,
        validateStatus: () => true,
      });
      const payload = data?.data && typeof data.data === 'object' ? data.data : data;
      const payUrl = payload?.directPayLink ? String(payload.directPayLink) : null;
      const walletOrderId = payload?.id ? String(payload.id) : null;
      if (status >= 300 || !payUrl) {
        throw new BadRequestException(
          String(data?.message || data?.status || payload?.message || 'Failed to create Wallet Pay order'),
        );
      }
      await this.ledger.markStatus(idempotencyKey, 'pending', {
        payUrl,
        walletOrderId,
        customData,
        externalId,
      });
      return {
        ledgerId: row.id,
        walletOrderId,
        payUrl,
        amount: priced.amount,
        currencyCode: priced.currencyCode,
        duplicate: false,
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Wallet Pay createOrder failed: ${err?.message || err}`);
      throw new BadRequestException(err?.message || 'Failed to create Wallet Pay order');
    }
  }

  async handleWalletPayWebhook(input: {
    adminId: string;
    httpMethod: string;
    uriPath: string;
    timestamp: string;
    signature: string;
    rawBody: Buffer | string;
    parsedBody?: unknown;
  }): Promise<{
    ok: boolean;
    processed: number;
    paid: Array<{
      orderId: string;
      surface: string;
      adminId: string;
      duplicate: boolean;
    }>;
  }> {
    const state = await this.ensureMigrated(input.adminId);
    const apiKey = this.decryptBotToken(state.walletPay.apiTokenEnc);
    if (!apiKey) {
      throw new BadRequestException('Wallet Pay is not configured');
    }
    const uriPaths = [
      ...walletPayWebhookPathCandidates(input.uriPath),
      walletPayWebhookPathForAdmin(input.adminId),
      walletPayWebhookPathForAdmin(input.adminId).replace(/^\/api/, ''),
    ];
    const valid = verifyWalletPayWebhook({
      apiKey,
      httpMethod: input.httpMethod,
      timestamp: input.timestamp,
      signature: input.signature,
      rawBody: input.rawBody,
      uriPaths,
    });
    if (!valid) {
      throw new UnauthorizedException('Invalid Wallet Pay signature');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        Buffer.isBuffer(input.rawBody) ? input.rawBody.toString('utf8') : String(input.rawBody || ''),
      );
    } catch {
      parsed = input.parsedBody ?? [];
    }
    const events = parseWalletPayWebhookEvents(parsed);
    const paid: Array<{ orderId: string; surface: string; adminId: string; duplicate: boolean }> = [];
    for (const event of events) {
      const type = String(event.type || '').toUpperCase();
      const payload = event.payload || {};
      const externalId = String(payload.externalId || '');
      const custom = decodeWalletPayCustomData(payload.customData);
      const fromExternal = externalId.startsWith(`${WALLET_PAY_GATEWAY}:`)
        ? (() => {
            const parts = externalId.split(':');
            return parts.length >= 3 ? { surface: parts[1], orderId: parts.slice(2).join(':') } : null;
          })()
        : null;
      const decoded = custom || fromExternal;
      if (!decoded) continue;
      const idempotencyKey = ledgerIdempotencyKey(WALLET_PAY_GATEWAY, decoded.surface, decoded.orderId);
      if (type === 'ORDER_FAILED') {
        await this.ledger.markStatus(idempotencyKey, 'failed', {
          eventId: event.eventId || null,
          walletOrderId: payload.id || null,
        });
        continue;
      }
      if (type !== 'ORDER_PAID') continue;
      const walletOrderId = String(payload.id || '').trim();
      if (!walletOrderId) continue;
      try {
        const completed = await this.completeWalletPayPayment({
          surface: decoded.surface,
          orderId: decoded.orderId,
          walletOrderId,
          eventId: event.eventId,
          selectedPaymentOption: payload.selectedPaymentOption,
        });
        paid.push({
          orderId: completed.orderId,
          surface: completed.surface,
          adminId: completed.adminId,
          duplicate: completed.duplicate,
        });
        if (!completed.duplicate) {
          await this.events?.emit('payment.verified', {
            orderId: completed.orderId,
            gateway: WALLET_PAY_GATEWAY,
            surface: completed.surface,
            adminId: completed.adminId,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Wallet Pay ORDER_PAID failed: ${err?.message || err}`);
      }
    }
    return { ok: true, processed: events.length, paid };
  }

  async completeWalletPayPayment(input: {
    surface: string;
    orderId: string;
    walletOrderId: string;
    eventId?: string;
    selectedPaymentOption?: unknown;
  }): Promise<{
    duplicate: boolean;
    orderId: string;
    surface: string;
    adminId: string;
    alreadyPaid: boolean;
  }> {
    const chargeId = String(input.walletOrderId || '').trim();
    if (!chargeId) throw new BadRequestException('Missing Wallet Pay order id');
    const idempotencyKey = ledgerIdempotencyKey(WALLET_PAY_GATEWAY, input.surface, input.orderId);
    const existing = await this.ledger.findByIdempotency(idempotencyKey);
    if (!existing) throw new BadRequestException('Payment is not registered');
    const { row, duplicate } = await this.ledger.markPaid({
      idempotencyKey,
      providerChargeId: chargeId,
      metadata: {
        eventId: input.eventId || null,
        selectedPaymentOption: input.selectedPaymentOption || null,
      },
    });
    return {
      duplicate,
      alreadyPaid: duplicate || row.status === 'paid',
      orderId: input.orderId,
      surface: input.surface,
      adminId: row.adminId,
    };
  }
}
