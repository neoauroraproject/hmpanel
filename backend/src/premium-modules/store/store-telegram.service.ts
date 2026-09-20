import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { TelegramHttpService } from '../../plugins/shared/telegram/telegram-http.service';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { prismaKnowsOrderIsTest } from '../ensure-premium-schema';
import { SettingsService } from '../../settings/settings.service';
import { BrandingService } from '../branding/branding.service';
import { normalizeTelegramLink } from '../../plugins/shared/utils/telegram-link';
import { StoreCustomerAuthService } from './store-customer-auth.service';
import { StoreRateLimitService } from './store-rate-limit.service';
import { generateCustomerToken, generateReferralCode } from './store.types';
import { StoreService } from './store.service';
import { StoreTelegramCommerceService } from './store-telegram-commerce.service';
import { StoreWalletService } from './store-wallet.service';
import { StoreCouponService } from './store-coupon.service';
import { formatMonthTable, renderYearlyRevenueChartPng } from './revenue-chart-png';
import { AdminRechargeTelegramCommerceService } from '../admin-recharge/admin-recharge-telegram-commerce.service';
import { AdminRechargeService } from '../admin-recharge/admin-recharge.service';
import { AdminRechargeTelegramService } from '../admin-recharge/admin-recharge-telegram.service';
import { PaygService } from '../store-payg/payg.service';
import { formatBotMoney, normalizeWalletCurrency, botT, normalizeBotLocale } from './store-bot-i18n';
import {
  CHANNEL_GATE_TTL_MS,
  TtlFlagCache,
  isChannelMember,
  normalizeChannelRef,
} from './store-channel-gate.util';
import { applyBotKeyboardWidth } from './store-bot-layout';
import {
  type BotMenuConfig,
  loadStoreBotMenu,
  normalizeBotMenu,
  saveStoreBotMenu,
} from './store-bot-menu.util';
import { formatDateTimeInTz } from '../../common/utils/timezone';
import {
  type BroadcastAudience,
  filterBroadcastRecipients,
} from './store-broadcast.util';
import {
  isDigitalInventoryProvider,
  isEylanProvider,
  parseFulfillment,
} from './providers/store-fulfillment.types';
import { isNativeEylanSubUrl } from './providers/eylan/eylan-url.util';
import { TelegramCoreService } from '../../bots/telegram-core.service';
import { PaymentManagementService } from '../../payments/payment-management.service';
import { FeatureManagerService } from '../../platform/feature-manager.service';
import { STORE_DIGITAL_MODULE_ID } from './providers/digital-goods/digital-goods.provider';

type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type BroadcastDraft = {
  adminId: string;
  audience: BroadcastAudience;
  text: string;
  photoFileId?: string;
  photoDataUrl?: string;
};

/** Conversational admin prompts (edit customer / create coupon / DM). */
type AdminPromptDraft = {
  adminId: string;
  kind:
    | 'cust_name'
    | 'cust_wa'
    | 'cust_tg'
    | 'cust_note'
    | 'cust_msg'
    | 'cpn_code'
    | 'cpn_value'
    | 'cpn_max'
    | 'wal_adjust'
    | 'prod_name'
    | 'prod_price_toman'
    | 'prod_price_usd'
    | 'prod_days'
    | 'prod_traffic'
    | 'prod_new_name'
    | 'prod_new_prices';
  targetId?: string;
  meta?: Record<string, string>;
};

@Injectable()
export class StoreTelegramService implements OnModuleInit {
  private readonly logger = new Logger(StoreTelegramService.name);
  private readonly broadcastDrafts = new Map<string, BroadcastDraft>();
  private readonly adminPromptDrafts = new Map<string, AdminPromptDraft>();
  /** When user sends a chat message, next bot UI reply should be a new message at the bottom. */
  private readonly chatNeedsNewMessage = new Set<string>();
  /** Last bot message we sent/edited per chat — only edit that one. */
  private readonly lastBotMessageId = new Map<string, number>();
  /** Forced-channel membership results, keyed adminId:channel:userId. */
  private readonly channelGateCache = new TtlFlagCache(CHANNEL_GATE_TTL_MS);
  /** Last "join the channel" prompt per cache key — keeps the bot from spamming. */
  private readonly channelGatePromptAt = new Map<string, number>();
  /** Resolved join links per adminId:channel (invite links are stable per bot). */
  private readonly channelLinkCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly customerAuth: StoreCustomerAuthService,
    private readonly rateLimit: StoreRateLimitService,
    @Inject(forwardRef(() => StoreService))
    private readonly store: StoreService,
    private readonly telegramHttp: TelegramHttpService,
    private readonly branding: BrandingService,
    private readonly commerce: StoreTelegramCommerceService,
    private readonly wallet: StoreWalletService,
    private readonly coupons: StoreCouponService,
    @Inject(forwardRef(() => AdminRechargeTelegramCommerceService))
    private readonly agencyCommerce: AdminRechargeTelegramCommerceService,
    @Inject(forwardRef(() => AdminRechargeService))
    private readonly adminRecharge: AdminRechargeService,
    @Inject(forwardRef(() => AdminRechargeTelegramService))
    private readonly adminRechargeTelegram: AdminRechargeTelegramService,
    @Optional()
    @Inject(forwardRef(() => PaygService))
    private readonly payg?: PaygService,
    @Optional() private readonly telegramCore?: TelegramCoreService,
    @Optional() private readonly paymentManagement?: PaymentManagementService,
    @Optional() private readonly features?: FeatureManagerService,
  ) {}

  onModuleInit() {
    this.telegramCore?.registerSender(async (input) => {
      const store = await this.prisma.storeProfile.findFirst({
        where: { telegramBotEnabled: true },
        select: { telegramBotTokenEnc: true },
      });
      const token = this.decryptToken(store?.telegramBotTokenEnc);
      if (!token) return { ok: false, skipped: true };
      const sent = await this.sendMessage(token, input.chatId, input.text);
      return { ok: !!sent?.ok };
    });
  }

  private markChatDirty(chatId: string | number) {
    this.chatNeedsNewMessage.add(String(chatId));
  }

  private async replyOrEdit(
    botToken: string,
    chatId: string | number,
    text: string,
    extra?: Record<string, unknown>,
    messageId?: number,
  ) {
    const key = String(chatId);
    const dirty = this.chatNeedsNewMessage.has(key);
    if (dirty) this.chatNeedsNewMessage.delete(key);
    const last = this.lastBotMessageId.get(key);
    const canEdit =
      !!messageId && !dirty && last !== undefined && Number(messageId) === Number(last);

    if (canEdit && messageId) {
      const ok = await this.editMessage(botToken, chatId, messageId, text, extra);
      if (ok) {
        this.lastBotMessageId.set(key, Number(messageId));
        return ok;
      }
    }

    const sent = await this.sendMessage(botToken, chatId, text, extra);
    if (sent?.messageId) this.lastBotMessageId.set(key, sent.messageId);
    return sent;
  }

  private encryptionKey() {
    const secret = process.env.TELEGRAM_TOKEN_SECRET || process.env.JWT_SECRET || 'hmpanel-dev-secret';
    return createHash('sha256').update(secret).digest();
  }

  encryptToken(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
  }

  decryptToken(payload?: string | null): string | null {
    if (!payload) return null;
    if (!payload.startsWith('v1:')) return payload; // legacy plain
    const [, ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivB64, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64url')),
        decipher.final(),
      ]);
      return dec.toString('utf8');
    } catch {
      return null;
    }
  }

  maskToken(token?: string | null) {
    if (!token) return null;
    if (token.length < 10) return '••••';
    return `${token.slice(0, 6)}…${token.slice(-4)}`;
  }

  validateInitData(initData: string, botToken: string): TelegramWebAppUser {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('Invalid Telegram initData');

    const entries: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') entries.push(`${key}=${value}`);
    });
    entries.sort();
    const dataCheckString = entries.join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Telegram initData signature mismatch');
    }

    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) {
      throw new UnauthorizedException('Telegram initData expired');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('Telegram user missing');
    try {
      return JSON.parse(userRaw) as TelegramWebAppUser;
    } catch {
      throw new UnauthorizedException('Telegram user invalid');
    }
  }

  private publicBaseUrl(store: {
    domain?: { domain: string; status: string } | null;
  }) {
    const custom =
      store.domain?.domain &&
      (store.domain.status === 'SSL_ACTIVE' || store.domain.status === 'VERIFIED')
        ? store.domain.domain
        : null;
    const panel = String(process.env.PANEL_DOMAIN || process.env.DOMAIN || '')
      .split(':')[0]
      .trim();
    const host = custom || panel;
    if (!host) return null;
    const proto = process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
    return `${proto}://${host}`;
  }

  buildMiniAppUrl(store: {
    slug: string;
    domain?: { domain: string; status: string } | null;
  }) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    return `${base}/shop/${encodeURIComponent(store.slug)}?tg=1`;
  }

  buildShopUrl(store: {
    slug: string;
    domain?: { domain: string; status: string } | null;
  }) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    return `${base}/shop/${encodeURIComponent(store.slug)}`;
  }

  buildPortalUrl(
    store: { domain?: { domain: string; status: string } | null },
    token?: string | null,
  ) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    if (token) return `${base}/portal/${encodeURIComponent(token)}`;
    return `${base}/portal`;
  }

  defaultWelcomeText(storeTitle: string) {
    return [
      `🎉 به فروشگاه <b>${storeTitle}</b> خوش آمدید!`,
      ``,
      `✨ اینجا می‌تونید:`,
      `🛒 سرویس جدید بخرید`,
      `📦 سرویس‌هاتون رو مدیریت کنید`,
      `🔄 تمدید کنید و لینک ساب بگیرید`,
      ``,
      `از دکمه‌های زیر شروع کنید 👇`,
    ].join('\n');
  }

  private panelAdminUrl(path = '/premium/store') {
    const panel = String(process.env.PANEL_DOMAIN || process.env.DOMAIN || '')
      .split(':')[0]
      .trim();
    if (!panel) return null;
    const proto = process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${proto}://${panel}${cleanPath}`;
  }

  private formatMoneyLabel(amount: number, currency: 'usd' | 'toman') {
    const n = Number(amount) || 0;
    if (currency === 'toman') return `${n.toLocaleString('fa-IR')} تومان`;
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }

  private adminHomeKeyboard(panelUrl: string | null, pendingCount = 0) {
    const pendingLabel =
      pendingCount > 0 ? `🔔 در انتظار (${pendingCount})` : '🔔 در انتظار';
    const rows: Array<Array<Record<string, unknown>>> = [
      [
        { text: '📊 داشبورد', callback_data: 'admin:home' },
        { text: pendingLabel, callback_data: 'admin:orders' },
      ],
      [
        { text: '📋 سفارش‌ها', callback_data: 'admin:orders' },
        { text: '💰 درآمد', callback_data: 'admin:revenue' },
      ],
      [
        { text: '📦 محصولات', callback_data: 'admin:products' },
        { text: '👥 مشتریان', callback_data: 'admin:customers' },
      ],
      [
        { text: '🎟 کوپن‌ها', callback_data: 'admin:coupons' },
        { text: '💳 کیف‌پول', callback_data: 'admin:wallet' },
      ],
      [{ text: '📢 پیام همگانی', callback_data: 'admin:broadcast' }],
    ];
    if (panelUrl) {
      rows.push([{ text: '⚙️ ورود به پنل فروشگاه', url: panelUrl }]);
    }
    rows.push([{ text: '🔄 بروزرسانی', callback_data: 'admin:home' }]);
    return { inline_keyboard: rows };
  }

  private async sendAdminHome(
    botToken: string,
    chatId: string | number,
    store: {
      adminId: string;
      title: string;
      slug: string;
      domain?: { domain: string; status: string } | null;
    },
    messageId?: number,
  ) {
    const dash = await this.store.getDashboard(store.adminId);
    const todayParts: string[] = [];
    if (Number(dash.revenueTodayToman) > 0) {
      todayParts.push(this.formatMoneyLabel(dash.revenueTodayToman!, 'toman'));
    }
    if (Number(dash.revenueToday) > 0) {
      todayParts.push(this.formatMoneyLabel(dash.revenueToday, 'usd'));
    }
    const monthParts: string[] = [];
    if (Number(dash.revenueMonthToman) > 0) {
      monthParts.push(this.formatMoneyLabel(dash.revenueMonthToman!, 'toman'));
    }
    if (Number(dash.revenueMonth) > 0) {
      monthParts.push(this.formatMoneyLabel(dash.revenueMonth, 'usd'));
    }

    const lines = [
      `👋 <b>پنل ادمین فروشگاه</b>`,
      `<b>${this.escapeHtml(store.title)}</b>`,
      ``,
      `📋 سفارش جدید / در انتظار: <b>${dash.newOrders ?? 0}</b>`,
      `⏳ در حال پردازش: <b>${dash.pendingOrders ?? 0}</b>`,
      `✅ تکمیل‌شده: <b>${dash.completedOrders ?? 0}</b>`,
      `🛒 امروز: <b>${dash.todayOrders ?? 0}</b> سفارش`,
      `🧪 تست امروز: <b>${dash.testsSent ?? 0}</b> ارسال / <b>${dash.testsDelivered ?? 0}</b> تحویل`,
      `📦 محصول فعال: <b>${dash.activeProducts ?? 0}</b>`,
      `👥 مشتری: <b>${dash.customers ?? 0}</b>`,
      ``,
      `💰 درآمد امروز: <b>${todayParts.join(' · ') || '—'}</b>`,
      `📈 درآمد ماه: <b>${monthParts.join(' · ') || '—'}</b>`,
      ``,
      `از دکمه‌های زیر مدیریت کنید:`,
    ];

    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      {
        reply_markup: this.adminHomeKeyboard(
          this.panelAdminUrl('/premium/store'),
          Number(dash.newOrders || 0),
        ),
      },
      messageId,
    );
  }

  private async sendAdminOrdersList(
    botToken: string,
    chatId: string | number,
    adminId: string,
    storeId: string,
    messageId?: number,
  ) {
    const pending = await this.prisma.storeOrder.findMany({
      where: {
        storeId,
        OR: [
          { status: { in: ['UNDER_REVIEW', 'PAYMENT_SUBMITTED', 'PENDING_PAYMENT'] } },
          {
            pendingReview: true,
            status: { in: ['ACTIVE', 'RENEWED', 'APPROVED', 'PROVISIONING'] },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        trackingCode: true,
        amount: true,
        currency: true,
        configName: true,
        isRenewal: true,
        ...(prismaKnowsOrderIsTest() ? { isTest: true } : {}),
        product: { select: { name: true, isTest: true, category: { select: { name: true } } } },
        renewClient: { select: { email: true, remark: true } },
        client: { select: { email: true, remark: true } },
      },
    });

    const homeKb = this.adminHomeKeyboard(this.panelAdminUrl('/premium/store'));

    if (!pending.length) {
      await this.replyOrEdit(
        botToken,
        chatId,
        '✅ فعلاً سفارش معلقی نیست.\nسفارش‌های جدید اینجا با دکمه تأیید/رد می‌آیند.',
        { reply_markup: homeKb },
        messageId,
      );
      return;
    }

    const lines = [
      `📋 <b>${pending.length}</b> سفارش در صف بررسی`,
      ``,
      ...pending.map((o, i) => {
        const money = this.formatMoneyLabel(
          Number(o.amount) || 0,
          ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(String(o.currency || '').toUpperCase())
            ? 'toman'
            : 'usd',
        );
        const kind = o.isRenewal ? 'تمدید' : 'جدید';
        const cat = o.product?.category?.name
          ? this.escapeHtml(o.product.category.name)
          : '';
        const testTag = o.isTest || o.product?.isTest ? ' · تست' : '';
        const serverName =
          o.renewClient?.email ||
          o.renewClient?.remark ||
          o.client?.email ||
          o.client?.remark ||
          (o.configName && o.configName !== 'renewal' ? o.configName : null) ||
          '—';
        const name = this.escapeHtml(serverName);
        const catBit = cat ? ` · ${cat}` : '';
        return `${i + 1}. <code>${this.escapeHtml(o.trackingCode)}</code> · ${kind}${testTag}${catBit} · ${name} · ${money}`;
      }),
      ``,
      `از دکمه‌های زیر تأیید یا رد کنید:`,
    ];

    const rows: Array<Array<Record<string, unknown>>> = [];
    for (const o of pending) {
      const short = String(o.trackingCode || o.id).slice(0, 12);
      rows.push([
        { text: `✅ ${short}`, callback_data: `approve:${o.id}` },
        { text: `❌ ${short}`, callback_data: `reject:${o.id}` },
      ]);
    }
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);

    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminRevenue(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
    year = new Date().getFullYear(),
  ) {
    const dash = await this.store.getDashboard(adminId);
    const series = await this.store.getRevenueByMonth(adminId, year);
    const preferToman = String(series.defaultCurrency || '').toUpperCase() !== 'USD';
    const table = formatMonthTable(
      series.months,
      (n, c) => this.formatMoneyLabel(n, c),
      preferToman,
    );
    const lines = [
      `💰 <b>درآمد فروشگاه — ${year}</b>`,
      ``,
      `📅 امروز: ${this.formatMoneyLabel(dash.revenueTodayToman || 0, 'toman')} · ${this.formatMoneyLabel(dash.revenueToday || 0, 'usd')}`,
      `📆 این ماه: ${this.formatMoneyLabel(dash.revenueMonthToman || 0, 'toman')} · ${this.formatMoneyLabel(dash.revenueMonth || 0, 'usd')}`,
      `🗓 امسال: ${this.formatMoneyLabel(series.yearToman, 'toman')} · ${this.formatMoneyLabel(series.yearUsd, 'usd')}`,
      ``,
      `🛒 سفارش امروز: <b>${dash.todayOrders ?? 0}</b> · تکمیل‌شده: <b>${dash.completedOrders ?? 0}</b>`,
      ``,
      `<b>ماه به ماه</b>`,
      table,
    ];
    const kb = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '◀️ سال قبل', callback_data: `admin:rev:y:${year - 1}` },
            { text: 'سال بعد ▶️', callback_data: `admin:rev:y:${year + 1}` },
          ],
          [{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }],
        ],
      },
    };
    await this.replyOrEdit(botToken, chatId, lines.join('\n'), kb, messageId);
    try {
      const png = renderYearlyRevenueChartPng({
        year,
        months: series.months,
        preferToman,
        yearTotal: preferToman ? series.yearToman : series.yearUsd,
      });
      await this.sendPhoto(
        botToken,
        chatId,
        png,
        `📊 نمودار ${year} — ${preferToman ? 'تومان' : 'USD'} · جمع: ${this.formatMoneyLabel(
          preferToman ? series.yearToman : series.yearUsd,
          preferToman ? 'toman' : 'usd',
        )}`,
        kb,
      );
    } catch (err: any) {
      this.logger.warn(`revenue chart failed: ${err?.message || err}`);
    }
  }

  private adminPromptKey(adminId: string, chatId: string | number) {
    return `${adminId}:${chatId}`;
  }

  private async startAdminPrompt(
    adminId: string,
    chatId: string | number,
    botToken: string,
    draft: Omit<AdminPromptDraft, 'adminId'>,
    prompt: string,
  ) {
    this.adminPromptDrafts.set(this.adminPromptKey(adminId, chatId), {
      adminId,
      ...draft,
    });
    await this.sendMessage(botToken, chatId, `${prompt}\n\nبرای لغو: /cancel`, {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
      },
    });
  }

  private async sendAdminProducts(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
    page = 0,
  ) {
    const pageSize = 6;
    const products = await this.store.listProducts(adminId);
    const total = products.length;
    const slice = products.slice(page * pageSize, page * pageSize + pageSize);
    if (!slice.length) {
      await this.replyOrEdit(
        botToken,
        chatId,
        '📦 محصولی ثبت نشده.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ محصول جدید', callback_data: 'admin:prod:new' }],
              [{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }],
            ],
          },
        },
        messageId,
      );
      return;
    }
    const rows: Array<Array<Record<string, unknown>>> = slice.map((p: any) => [
      {
        text: `${p.visible === false ? '🙈' : '👁'} ${(p.name || 'محصول').slice(0, 26)}`,
        callback_data: `admin:prod:v:${p.id}`,
      },
    ]);
    const nav: Array<Record<string, unknown>> = [];
    if (page > 0) nav.push({ text: '◀️ قبلی', callback_data: `admin:prod:p:${page - 1}` });
    if ((page + 1) * pageSize < total) {
      nav.push({ text: 'بعدی ▶️', callback_data: `admin:prod:p:${page + 1}` });
    }
    if (nav.length) rows.push(nav);
    rows.push([{ text: '➕ محصول جدید', callback_data: 'admin:prod:new' }]);
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.replyOrEdit(
      botToken,
      chatId,
      `📦 <b>محصولات</b> (${total})\nصفحه ${page + 1} از ${Math.max(1, Math.ceil(total / pageSize))}\nبرای مدیریت روی هر محصول بزنید.`,
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminProductView(
    botToken: string,
    chatId: string | number,
    adminId: string,
    productId: string,
    messageId?: number,
  ) {
    const products = await this.store.listProducts(adminId);
    const p: any = products.find((x: any) => x.id === productId);
    if (!p) {
      await this.replyOrEdit(botToken, chatId, 'محصول پیدا نشد.', undefined, messageId);
      return;
    }
    const toman =
      p.priceToman != null && Number(p.priceToman) > 0
        ? this.formatMoneyLabel(Number(p.priceToman), 'toman')
        : '—';
    const usd = this.formatMoneyLabel(Number(p.priceUsd || 0), 'usd');
    const trafficNum = Number(p.traffic || 0);
    const trafficGb =
      trafficNum <= 0 ? 'نامحدود' : `${(trafficNum / 1024 ** 3).toFixed(trafficNum % 1024 ** 3 === 0 ? 0 : 1)} GB`;
    const lines = [
      `📦 <b>${this.escapeHtml(p.name || 'محصول')}</b>`,
      `وضعیت نمایش: ${p.visible === false ? 'مخفی' : 'نمایش'}`,
      `تومان: <b>${toman}</b>`,
      `دلار: <b>${usd}</b>`,
      `مدت: ${p.durationDays ?? '—'} روز`,
      `ترافیک: ${trafficGb}`,
      p.category?.name ? `دسته: ${this.escapeHtml(p.category.name)}` : '',
      p.profile?.name ? `پروفایل: ${this.escapeHtml(p.profile.name)}` : '',
      p.badge ? `برچسب: ${this.escapeHtml(p.badge)}` : '',
      `تمدیدپذیر: ${p.renewable === false ? 'خیر' : 'بله'}`,
      p.isTest ? '🧪 محصول تست' : '',
    ].filter(Boolean);
    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: p.visible === false ? '👁 نمایش بده' : '🙈 مخفی کن',
                callback_data: `admin:prod:tog:${p.id}`,
              },
            ],
            [
              { text: '✏️ نام', callback_data: `admin:prod:e:name:${p.id}` },
              { text: '📅 مدت', callback_data: `admin:prod:e:days:${p.id}` },
            ],
            [
              { text: '💰 تومان', callback_data: `admin:prod:e:pt:${p.id}` },
              { text: '💵 دلار', callback_data: `admin:prod:e:pu:${p.id}` },
            ],
            [{ text: '📶 ترافیک', callback_data: `admin:prod:e:tr:${p.id}` }],
            [
              { text: '◀️ لیست محصولات', callback_data: 'admin:prod:p:0' },
              { text: '🏠 منوی ادمین', callback_data: 'admin:home' },
            ],
          ],
        },
      },
      messageId,
    );
  }

  private async sendAdminProductCategoryPicker(
    botToken: string,
    chatId: string | number,
    adminId: string,
  ) {
    const cats = (await this.store.listCategories(adminId)).filter(
      (c: any) => c.visible !== false && c.enabled !== false,
    );
    if (!cats.length) {
      this.adminPromptDrafts.delete(this.adminPromptKey(adminId, chatId));
      await this.sendMessage(
        botToken,
        chatId,
        'دسته‌ای نیست. اول از پنل وب یک دسته بسازید.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
          },
        },
      );
      return;
    }
    const rows = cats.slice(0, 12).map((c: any) => [
      { text: String(c.name || 'دسته').slice(0, 40), callback_data: `admin:prod:new:cat:${c.id}` },
    ]);
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.sendMessage(botToken, chatId, 'دسته محصول را انتخاب کنید:', {
      reply_markup: { inline_keyboard: rows },
    });
  }

  private async sendAdminProductProfilePicker(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
  ) {
    const profiles = await this.store.listProfiles(adminId);
    if (!profiles.length) {
      this.adminPromptDrafts.delete(this.adminPromptKey(adminId, chatId));
      await this.sendMessage(
        botToken,
        chatId,
        'پروفایل پروویژن نیست. اول از پنل وب پروفایل بسازید.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
          },
        },
      );
      return;
    }
    const rows = profiles.slice(0, 12).map((p: any) => [
      {
        text: String(p.name || p.panel?.name || 'پروفایل').slice(0, 40),
        callback_data: `admin:prod:new:prof:${p.id}`,
      },
    ]);
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.replyOrEdit(
      botToken,
      chatId,
      'پروفایل پروویژن را انتخاب کنید:',
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminCustomers(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
    page = 0,
  ) {
    const pageSize = 6;
    const [total, customers] = await Promise.all([
      this.prisma.storeCustomer.count({ where: { adminId } }),
      this.prisma.storeCustomer.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          telegramUsername: true,
          telegramUserId: true,
          whatsapp: true,
          telegram: true,
        },
      }),
    ]);
    if (!customers.length) {
      await this.replyOrEdit(
        botToken,
        chatId,
        '👥 هنوز مشتری‌ای نیست.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
          },
        },
        messageId,
      );
      return;
    }
    const rows: Array<Array<Record<string, unknown>>> = customers.map((c, i) => {
      const label =
        c.name ||
        (c.telegramUsername ? `@${c.telegramUsername}` : '') ||
        c.telegramUserId ||
        'مشتری';
      const phone = String(c.whatsapp || c.telegram || '').replace(/\s+/g, '');
      const phoneBit = phone ? ` · ${phone}` : '';
      return [
        {
          text: `${page * pageSize + i + 1}. ${String(label).slice(0, 18)}${phoneBit}`.slice(0, 64),
          callback_data: `admin:cust:v:${c.id}`,
        },
      ];
    });
    const nav: Array<Record<string, unknown>> = [];
    if (page > 0) nav.push({ text: '◀️ قبلی', callback_data: `admin:cust:p:${page - 1}` });
    if ((page + 1) * pageSize < total) {
      nav.push({ text: 'بعدی ▶️', callback_data: `admin:cust:p:${page + 1}` });
    }
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.replyOrEdit(
      botToken,
      chatId,
      `👥 <b>مشتریان</b> (${total})\nصفحه ${page + 1} از ${Math.max(1, Math.ceil(total / pageSize))}\nروی هر ردیف بزنید تا جزئیات/ویرایش باز شود.`,
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminCustomerView(
    botToken: string,
    chatId: string | number,
    adminId: string,
    customerId: string,
    messageId?: number,
  ) {
    const c = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
      include: {
        wallet: { select: { balance: true, currency: true } },
        _count: { select: { orders: true } },
      },
    });
    if (!c) {
      await this.replyOrEdit(botToken, chatId, 'مشتری پیدا نشد.', undefined, messageId);
      return;
    }
    const phone = String(c.whatsapp || '').trim();
    const tgUser = c.telegramUsername ? `@${c.telegramUsername}` : c.telegram || '—';
    const bal =
      c.wallet != null
        ? this.formatMoneyLabel(
            Number(c.wallet.balance || 0),
            ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(String(c.wallet.currency || '').toUpperCase())
              ? 'toman'
              : 'usd',
          )
        : '—';
    const statusTag =
      String((c as any).status || 'active') === 'blocked'
        ? ' 🚫 بلاک'
        : String((c as any).status || 'active') === 'restricted'
          ? ' ⚠️ محدودشده'
          : '';
    const lines = [
      `👤 <b>${this.escapeHtml(c.name || 'بدون نام')}</b>${statusTag}`,
      `شناسه: <code>${c.id.slice(0, 8)}</code>`,
      `تلگرام: ${this.escapeHtml(String(tgUser))}`,
      c.telegramUserId ? `TG ID: <code>${this.escapeHtml(c.telegramUserId)}</code>` : '',
      `واتساپ/شماره: ${phone ? this.escapeHtml(phone) : '—'}`,
      c.email ? `ایمیل: ${this.escapeHtml(c.email)}` : '',
      `سفارش‌ها: <b>${c._count.orders}</b>`,
      `کیف‌پول: <b>${bal}</b>`,
      c.notes ? `یادداشت: ${this.escapeHtml(String(c.notes).slice(0, 200))}` : '',
    ].filter(Boolean);

    const contactRow: Array<Record<string, unknown>> = [];
    if (phone) {
      const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      if (digits) {
        contactRow.push({ text: '📱 واتساپ', url: `https://wa.me/${digits}` });
      }
    }
    if (c.telegramUsername) {
      contactRow.push({ text: '✈️ تلگرام', url: `https://t.me/${c.telegramUsername}` });
    }

    const rows: Array<Array<Record<string, unknown>>> = [];
    if (contactRow.length) rows.push(contactRow);
    rows.push([
      { text: '✏️ نام', callback_data: `admin:cust:e:name:${c.id}` },
      { text: '📞 شماره', callback_data: `admin:cust:e:wa:${c.id}` },
    ]);
    rows.push([
      { text: '✈️ یوزرنیم', callback_data: `admin:cust:e:tg:${c.id}` },
      { text: '📝 یادداشت', callback_data: `admin:cust:e:note:${c.id}` },
    ]);
    if (c.telegramUserId) {
      rows.push([{ text: '✉️ پیام به مشتری', callback_data: `admin:cust:e:msg:${c.id}` }]);
    }
    rows.push([
      { text: '💰 تنظیم کیف‌پول', callback_data: `admin:cust:e:wal:${c.id}` },
    ]);
    rows.push([
      { text: '◀️ لیست مشتریان', callback_data: 'admin:cust:p:0' },
      { text: '🏠 منوی ادمین', callback_data: 'admin:home' },
    ]);

    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminCoupons(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
    page = 0,
  ) {
    const pageSize = 6;
    const [total, coupons] = await Promise.all([
      this.prisma.storeCoupon.count({ where: { adminId } }),
      this.prisma.storeCoupon.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
    ]);
    const rows: Array<Array<Record<string, unknown>>> = coupons.map((c) => [
      {
        text: `${c.enabled ? '✅' : '⏸'} ${c.code} · ${c.usedCount}${c.maxUses != null ? '/' + c.maxUses : ''}`.slice(
          0,
          64,
        ),
        callback_data: `admin:cpn:v:${c.id}`,
      },
    ]);
    if (!coupons.length) {
      rows.push([{ text: '➕ ساخت کوپن', callback_data: 'admin:cpn:new' }]);
    } else {
      const nav: Array<Record<string, unknown>> = [];
      if (page > 0) nav.push({ text: '◀️ قبلی', callback_data: `admin:cpn:p:${page - 1}` });
      if ((page + 1) * pageSize < total) {
        nav.push({ text: 'بعدی ▶️', callback_data: `admin:cpn:p:${page + 1}` });
      }
      if (nav.length) rows.push(nav);
      rows.push([{ text: '➕ ساخت کوپن', callback_data: 'admin:cpn:new' }]);
    }
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.replyOrEdit(
      botToken,
      chatId,
      `🎟 <b>کوپن‌ها</b> (${total})\nبرای ویرایش روی هر کوپن بزنید.`,
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminCouponView(
    botToken: string,
    chatId: string | number,
    adminId: string,
    couponId: string,
    messageId?: number,
  ) {
    const c = await this.prisma.storeCoupon.findFirst({ where: { id: couponId, adminId } });
    if (!c) {
      await this.replyOrEdit(botToken, chatId, 'کوپن پیدا نشد.', undefined, messageId);
      return;
    }
    const value =
      c.discountType === 'percent'
        ? `${c.discountValue}%`
        : [
            c.discountValueToman ? `${Number(c.discountValueToman).toLocaleString('fa-IR')} تومان` : '',
            c.discountValueUsd ? `$${c.discountValueUsd}` : '',
          ]
            .filter(Boolean)
            .join(' / ') || String(c.discountValue);
    const lines = [
      `🎟 <b><code>${this.escapeHtml(c.code)}</code></b>`,
      `وضعیت: ${c.enabled ? 'فعال' : 'غیرفعال'}`,
      `تخفیف: ${this.escapeHtml(value)}`,
      `مصرف: ${c.usedCount}${c.maxUses != null ? ' / ' + c.maxUses : ' (بدون سقف)'}`,
      c.description ? `توضیح: ${this.escapeHtml(c.description)}` : '',
    ].filter(Boolean);
    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: c.enabled ? '⏸ غیرفعال' : '✅ فعال',
                callback_data: `admin:cpn:tog:${c.id}`,
              },
            ],
            [
              { text: '➕ سقف مصرف', callback_data: `admin:cpn:max:+:${c.id}` },
              { text: '➖ سقف مصرف', callback_data: `admin:cpn:max:-:${c.id}` },
            ],
            [{ text: '✏️ سقف دقیق', callback_data: `admin:cpn:maxset:${c.id}` }],
            [{ text: '🗑 حذف', callback_data: `admin:cpn:del:${c.id}` }],
            [
              { text: '◀️ لیست کوپن', callback_data: 'admin:cpn:p:0' },
              { text: '🏠 منوی ادمین', callback_data: 'admin:home' },
            ],
          ],
        },
      },
      messageId,
    );
  }

  private async sendAdminWallet(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
    page = 0,
  ) {
    const pageSize = 5;
    const where = { adminId, status: { in: ['PENDING', 'SUBMITTED'] as string[] } };
    const [total, deposits] = await Promise.all([
      this.prisma.storeWalletDeposit.count({ where: where as any }),
      this.prisma.storeWalletDeposit.findMany({
        where: where as any,
        include: {
          customer: {
            select: { name: true, telegramUsername: true, telegramUserId: true, whatsapp: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
    ]);
    if (!deposits.length) {
      await this.replyOrEdit(
        botToken,
        chatId,
        '💳 واریز معلقی نیست.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
          },
        },
        messageId,
      );
      return;
    }
    const rows: Array<Array<Record<string, unknown>>> = deposits.map((d) => {
      const who =
        d.customer?.name ||
        (d.customer?.telegramUsername ? `@${d.customer.telegramUsername}` : '') ||
        'مشتری';
      const money = this.formatMoneyLabel(
        d.amount,
        ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(String(d.currency || '').toUpperCase())
          ? 'toman'
          : 'usd',
      );
      return [
        {
          text: `${money} · ${String(who).slice(0, 16)}`.slice(0, 64),
          callback_data: `admin:wal:v:${d.id}`,
        },
      ];
    });
    const nav: Array<Record<string, unknown>> = [];
    if (page > 0) nav.push({ text: '◀️ قبلی', callback_data: `admin:wal:p:${page - 1}` });
    if ((page + 1) * pageSize < total) {
      nav.push({ text: 'بعدی ▶️', callback_data: `admin:wal:p:${page + 1}` });
    }
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]);
    await this.replyOrEdit(
      botToken,
      chatId,
      `💳 <b>واریزهای در انتظار</b> (${total})`,
      { reply_markup: { inline_keyboard: rows } },
      messageId,
    );
  }

  private async sendAdminWalletView(
    botToken: string,
    chatId: string | number,
    adminId: string,
    depositId: string,
    messageId?: number,
  ) {
    const d = await this.prisma.storeWalletDeposit.findFirst({
      where: { id: depositId, adminId },
      include: {
        customer: {
          select: { id: true, name: true, telegramUsername: true, whatsapp: true, telegramUserId: true },
        },
      },
    });
    if (!d) {
      await this.replyOrEdit(botToken, chatId, 'واریز پیدا نشد.', undefined, messageId);
      return;
    }
    const money = this.formatMoneyLabel(
      d.amount,
      ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(String(d.currency || '').toUpperCase())
        ? 'toman'
        : 'usd',
    );
    const who =
      d.customer?.name ||
      (d.customer?.telegramUsername ? `@${d.customer.telegramUsername}` : '') ||
      '—';
    const lines = [
      `💳 <b>واریز کیف‌پول</b>`,
      `مبلغ: <b>${money}</b>`,
      `وضعیت: ${d.status}`,
      `مشتری: ${this.escapeHtml(String(who))}`,
      d.customer?.whatsapp ? `شماره: ${this.escapeHtml(d.customer.whatsapp)}` : '',
      d.receiptText ? `رسید: ${this.escapeHtml(String(d.receiptText).slice(0, 200))}` : '',
    ].filter(Boolean);
    await this.replyOrEdit(
      botToken,
      chatId,
      lines.join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ تأیید', callback_data: `admin:wal:ok:${d.id}` },
              { text: '❌ رد', callback_data: `admin:wal:no:${d.id}` },
            ],
            [
              { text: '◀️ لیست واریز', callback_data: 'admin:wal:p:0' },
              { text: '🏠 منوی ادمین', callback_data: 'admin:home' },
            ],
          ],
        },
      },
      messageId,
    );
  }

  private storeActionKeyboard(
    store: {
      slug: string;
      domain?: { domain: string; status: string } | null;
    },
    opts?: { openLabel?: string; supportButtons?: Array<Record<string, unknown>> },
  ) {
    const miniAppUrl = this.buildMiniAppUrl(store);
    const shopUrl = this.buildShopUrl(store);
    const rows: Array<Array<Record<string, unknown>>> = [];
    if (miniAppUrl) {
      rows.push([{ text: opts?.openLabel || '🚀 Open', web_app: { url: miniAppUrl } }]);
    }
    if (shopUrl) {
      rows.push([{ text: '🌐 فروشگاه وب', url: shopUrl }]);
    }
    if (opts?.supportButtons?.length) {
      rows.push(opts.supportButtons);
    }
    return rows.length ? { inline_keyboard: rows } : undefined;
  }

  private orderNumberLine(trackingCode: string) {
    return `🧾 <b>شماره سفارش:</b> <code>${this.escapeHtml(trackingCode)}</code>`;
  }

  private async supportKeyboardButtons(adminId: string) {
    try {
      const branding = await this.branding.getBranding(adminId);
      const links = branding?.supportLinks;
      if (!links) return [] as Array<Record<string, unknown>>;
      const buttons: Array<Record<string, unknown>> = [];
      if (links.showTelegram && links.telegramLink) {
        const tg = normalizeTelegramLink(links.telegramLink);
        if (tg) buttons.push({ text: '💬 پشتیبانی تلگرام', url: tg });
      }
      if (links.showWhatsApp && links.whatsappLink) {
        buttons.push({ text: '🟢 واتساپ', url: links.whatsappLink });
      }
      if (links.showWebsite && links.websiteUrl) {
        buttons.push({ text: '🌐 وب‌سایت', url: links.websiteUrl });
      }
      if (links.showEmail && links.emailAddress) {
        buttons.push({ text: '✉️ ایمیل', url: `mailto:${links.emailAddress}` });
      }
      return buttons.slice(0, 3);
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  }

  buildTrackUrl(store: { domain?: { domain: string; status: string } | null }, trackingCode: string) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    return `${base}/track/${encodeURIComponent(trackingCode)}`;
  }

  buildSubUrl(store: { domain?: { domain: string; status: string } | null }, subId: string) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    return `${base}/s/${encodeURIComponent(subId)}`;
  }

  /**
   * Resolve the subscription URL customers receive.
   * - hmpanel (default): panel/custom-domain `/s/{subId}`
   * - native: 3x-ui panel `subUrl/{subId}` or `{url}/sub/{subId}`
   */
  resolveCustomerSubUrl(
    store: {
      subscriptionLinkMode?: string | null;
      domain?: { domain: string; status: string } | null;
    },
    subId: string | null | undefined,
    panel?: { subUrl?: string | null; url?: string | null } | null,
  ): string | null {
    if (!subId) return null;
    if (/^https?:\/\//i.test(subId)) return subId;
    const mode = String(store.subscriptionLinkMode || 'hmpanel').toLowerCase();
    if (mode === 'native') {
      if (panel?.subUrl) {
        return `${panel.subUrl.replace(/\/$/, '')}/${encodeURIComponent(subId)}`;
      }
      if (panel?.url) {
        return `${panel.url.replace(/\/$/, '')}/sub/${encodeURIComponent(subId)}`;
      }
      // Fall back to HMPanel link if panel has no native sub base.
    }
    return this.buildSubUrl(store, subId);
  }

  buildSubPortalUrl(store: { domain?: { domain: string; status: string } | null }, subId: string) {
    const base = this.publicBaseUrl(store);
    if (!base) return null;
    return `${base}/p/${encodeURIComponent(subId)}`;
  }

  private appImportLinks(subUrl: string, name: string) {
    const encoded = encodeURIComponent(subUrl);
    const label = encodeURIComponent(name || 'Subscription');
    return {
      v2box: `v2box://install-sub?url=${encoded}&name=${label}`,
      streisand: `streisand://import/${encoded}`,
      happ: `happ://add/${encoded}`,
    };
  }

  private httpsAppBridge(
    store: { domain?: { domain: string; status: string } | null },
    deepLink: string,
  ) {
    const base = this.publicBaseUrl(store);
    if (!base) return deepLink;
    return `${base}/app-import?to=${encodeURIComponent(deepLink)}`;
  }

  private serviceReadyKeyboard(
    store: {
      slug: string;
      domain?: { domain: string; status: string } | null;
    },
    opts: {
      subUrl?: string | null;
      subId?: string | null;
      serviceName?: string | null;
      /** Eylan OpenVPN/WG/L2TP — download page, not V2Ray app import */
      eylan?: boolean;
      locale?: 'fa' | 'en';
    },
  ) {
    const rows: Array<Array<Record<string, unknown>>> = [];
    const loc = opts.locale === 'en' ? 'en' : 'fa';
    if (opts.subUrl) {
      if (opts.eylan) {
        rows.push([
          {
            text: loc === 'en' ? '📥 Open sub & download configs' : '📥 لینک ساب / دانلود کانفیگ',
            url: opts.subUrl,
          },
        ]);
      } else {
        const apps = this.appImportLinks(opts.subUrl, opts.serviceName || 'VPN');
        rows.push([
          { text: '📱 V2Box', url: this.httpsAppBridge(store, apps.v2box) },
          { text: '⚡ Streisand', url: this.httpsAppBridge(store, apps.streisand) },
        ]);
        rows.push([{ text: '✨ Happ', url: this.httpsAppBridge(store, apps.happ) }]);
      }
    }
    if (!opts.eylan) {
      const portalUrl = opts.subId ? this.buildSubPortalUrl(store, opts.subId) : null;
      if (portalUrl) {
        rows.push([
          {
            text: loc === 'en' ? '📊 Usage & remaining time' : '📊 حجم و زمان باقیمانده',
            web_app: { url: portalUrl },
          },
        ]);
      }
    }
    const miniAppUrl = this.buildMiniAppUrl(store);
    if (miniAppUrl) {
      rows.push([{ text: loc === 'en' ? '🚀 Store' : '🚀 فروشگاه', web_app: { url: miniAppUrl } }]);
    }
    rows.push([
      {
        text: loc === 'en' ? '⬅️ Main menu' : '⬅️ بازگشت به منوی اصلی',
        callback_data: 'c:home',
      },
    ]);
    return rows.length ? { inline_keyboard: rows } : this.storeActionKeyboard(store);
  }

  private async buildQrDataUrl(text: string) {
    try {
      return await QRCode.toDataURL(text, {
        type: 'image/png',
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch (err: any) {
      this.logger.warn(`QR generate failed: ${err?.message || err}`);
      return null;
    }
  }

  async getBotTokenForStore(adminId: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: {
        telegramBotEnabled: true,
        telegramBotTokenEnc: true,
        telegramBotUsername: true,
        slug: true,
      },
    });
    if (!store?.telegramBotEnabled) return null;
    const token = this.decryptToken(store.telegramBotTokenEnc);
    if (!token) return null;
    return { token, username: store.telegramBotUsername, slug: store.slug };
  }

  async getTelegramSettings(adminId: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');
    const plain = this.decryptToken(store.telegramBotTokenEnc);
    const botLocale =
      String((store as any).telegramBotLocale || 'fa').toLowerCase() === 'en'
        ? 'en'
        : 'fa';
    return {
      enabled: store.telegramBotEnabled,
      botTokenMasked: this.maskToken(plain),
      hasToken: !!plain,
      botUsername: store.telegramBotUsername,
      welcomeText: store.telegramWelcomeText?.trim() || this.defaultWelcomeText(store.title),
      webhookConfigured: !!store.telegramWebhookSecret,
      adminChatId: store.telegramAdminChatId || null,
      forceChannel: (store as any).telegramForceChannel || null,
      botLocale,
      telegramBotLocale: botLocale,
      botBuyVpnLabel: (store as { botBuyVpnLabel?: string | null }).botBuyVpnLabel || null,
      botBuyDigitalLabel:
        (store as { botBuyDigitalLabel?: string | null }).botBuyDigitalLabel || null,
      miniAppUrl: this.buildMiniAppUrl(store),
      shopUrl: this.buildShopUrl(store),
      botMenu: await loadStoreBotMenu(this.prisma, adminId),
    };
  }

  async updateTelegramSettings(
    adminId: string,
    input: {
      enabled?: boolean;
      botToken?: string;
      welcomeText?: string | null;
      adminChatId?: string | null;
      botLocale?: string | null;
      telegramBotLocale?: string | null;
      botMenu?: BotMenuConfig | null;
      forceChannel?: string | null;
      botBuyVpnLabel?: string | null;
      botBuyDigitalLabel?: string | null;
    },
  ) {
    const store = await this.prisma.storeProfile.findUnique({ where: { adminId } });
    if (!store) throw new NotFoundException('Store not found');

    let tokenEnc = store.telegramBotTokenEnc;
    let username = store.telegramBotUsername;
    if (input.botToken !== undefined) {
      const trimmed = String(input.botToken || '').trim();
      if (trimmed) {
        tokenEnc = this.encryptToken(trimmed);
        try {
          const me = await this.telegramHttp.getTelegramJson(trimmed, 'getMe', 10_000);
          username = me?.result?.username || username;
        } catch {
          throw new BadRequestException('Invalid Telegram bot token');
        }
      }
    }

    const localeRaw =
      input.botLocale !== undefined
        ? input.botLocale
        : input.telegramBotLocale !== undefined
          ? input.telegramBotLocale
          : undefined;
    const nextLocale =
      localeRaw !== undefined
        ? String(localeRaw || 'fa').toLowerCase() === 'en'
          ? 'en'
          : 'fa'
        : undefined;

    const updated = await this.prisma.storeProfile.update({
      where: { adminId },
      data: {
        telegramBotEnabled:
          input.enabled !== undefined ? !!input.enabled : store.telegramBotEnabled,
        telegramBotTokenEnc: tokenEnc,
        telegramBotUsername: username,
        telegramWelcomeText:
          input.welcomeText !== undefined ? input.welcomeText : store.telegramWelcomeText,
        telegramAdminChatId:
          input.adminChatId !== undefined
            ? String(input.adminChatId || '').trim() || null
            : store.telegramAdminChatId,
        ...(nextLocale !== undefined
          ? { telegramBotLocale: nextLocale }
          : {}),
        ...(input.forceChannel !== undefined
          ? {
              telegramForceChannel: (() => {
                let value = String(input.forceChannel || '').trim();
                value = value.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
                if (!value) return null;
                return /^-?\d+$/.test(value) ? value : `@${value}`;
              })(),
            }
          : {}),
        ...(input.botBuyVpnLabel !== undefined
          ? {
              botBuyVpnLabel:
                input.botBuyVpnLabel == null || String(input.botBuyVpnLabel).trim() === ''
                  ? null
                  : String(input.botBuyVpnLabel).trim().slice(0, 64),
            }
          : {}),
        ...(input.botBuyDigitalLabel !== undefined
          ? {
              botBuyDigitalLabel:
                input.botBuyDigitalLabel == null ||
                String(input.botBuyDigitalLabel).trim() === ''
                  ? null
                  : String(input.botBuyDigitalLabel).trim().slice(0, 64),
            }
          : {}),
      } as any,
      include: { domain: { select: { domain: true, status: true } } },
    });

    if (input.botMenu !== undefined) {
      await saveStoreBotMenu(this.prisma, adminId, normalizeBotMenu(input.botMenu));
    }

    const plain = this.decryptToken(updated.telegramBotTokenEnc);
    const botLocale =
      String((updated as any).telegramBotLocale || nextLocale || 'fa').toLowerCase() ===
      'en'
        ? 'en'
        : 'fa';
    return {
      enabled: updated.telegramBotEnabled,
      botTokenMasked: this.maskToken(plain),
      hasToken: !!plain,
      botUsername: updated.telegramBotUsername,
      welcomeText:
        updated.telegramWelcomeText?.trim() || this.defaultWelcomeText(updated.title),
      webhookConfigured: !!updated.telegramWebhookSecret,
      adminChatId: updated.telegramAdminChatId || null,
      forceChannel: (updated as any).telegramForceChannel || null,
      botLocale,
      telegramBotLocale: botLocale,
      botBuyVpnLabel: (updated as any).botBuyVpnLabel || null,
      botBuyDigitalLabel: (updated as any).botBuyDigitalLabel || null,
      miniAppUrl: this.buildMiniAppUrl(updated),
      shopUrl: this.buildShopUrl(updated),
      botMenu: await loadStoreBotMenu(this.prisma, adminId),
    };
  }

  async activateWebhook(adminId: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');
    const token = this.decryptToken(store.telegramBotTokenEnc);
    if (!token) throw new BadRequestException('Set a bot token first');
    if (!store.telegramBotEnabled) {
      throw new BadRequestException('Enable Telegram bot first');
    }

    const secret = store.telegramWebhookSecret || randomBytes(24).toString('hex');
    const base = this.publicBaseUrl(store);
    if (!base || !base.startsWith('https://')) {
      throw new BadRequestException(
        'HTTPS public panel/custom domain is required for Telegram webhook',
      );
    }
    const webhookUrl = `${base}/api/store/telegram/webhook/${encodeURIComponent(store.slug)}/${secret}`;

    try {
      await this.telegramHttp.postTelegramJson(
        token,
        'setWebhook',
        { url: webhookUrl, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] },
        15_000,
      );
    } catch (err: any) {
      this.logger.warn(`setWebhook failed: ${err?.message || err}`);
      throw new BadRequestException(
        err?.message ||
          'Failed to set Telegram webhook. Check bot token, HTTPS domain, and proxy settings.',
      );
    }

    const miniAppUrl = this.buildMiniAppUrl(store);
    if (miniAppUrl) {
      try {
        await this.telegramHttp.postTelegramJson(
          token,
          'setChatMenuButton',
          {
            menu_button: {
              type: 'web_app',
              text: 'Open',
              web_app: { url: miniAppUrl },
            },
          },
          15_000,
        );
      } catch (err: any) {
        this.logger.warn(`setChatMenuButton failed: ${err?.message || err}`);
      }
    }

    await this.prisma.storeProfile.update({
      where: { adminId },
      data: { telegramWebhookSecret: secret },
    });

    return { ok: true, webhookUrl, miniAppUrl };
  }

  async sendTestMessage(adminId: string, chatId: string) {
    const bot = await this.getBotTokenForStore(adminId);
    if (!bot) throw new BadRequestException('Telegram bot is not configured');
    const trimmed = String(chatId || '').trim();
    if (!trimmed) throw new BadRequestException('chatId required');
    await this.prisma.storeProfile.update({
      where: { adminId },
      data: { telegramAdminChatId: trimmed },
    });
    await this.sendMessage(
      bot.token,
      trimmed,
      '✅ ربات فروشگاه متصل شد.\nسفارش‌های جدید با دکمه تأیید/رد اینجا می‌آیند.',
    );
    return { ok: true, adminChatId: trimmed };
  }

  private escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendMessage(
    botToken: string,
    chatId: string | number,
    text: string,
    extra?: Record<string, unknown>,
  ): Promise<{ ok: boolean; messageId?: number }> {
    const outgoing = applyBotKeyboardWidth(text, extra);
    try {
      const res: any = await this.telegramHttp.postTelegramJson(
        botToken,
        'sendMessage',
        {
          chat_id: chatId,
          text: outgoing,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(extra || {}),
        },
        15_000,
      );
      const messageId = Number(res?.result?.message_id || res?.message_id || 0) || undefined;
      if (messageId) this.lastBotMessageId.set(String(chatId), messageId);
      return { ok: true, messageId };
    } catch (err: any) {
      const detail = err?.message || String(err);
      this.logger.warn(`Telegram sendMessage failed: ${detail}`);
      if (String(detail).toLowerCase().includes('parse')) {
        try {
          const res: any = await this.telegramHttp.postTelegramJson(
            botToken,
            'sendMessage',
            {
              chat_id: chatId,
              text: outgoing.replace(/<[^>]+>/g, ''),
              disable_web_page_preview: true,
              ...(extra || {}),
            },
            15_000,
          );
          const messageId = Number(res?.result?.message_id || res?.message_id || 0) || undefined;
          if (messageId) this.lastBotMessageId.set(String(chatId), messageId);
          return { ok: true, messageId };
        } catch (err2: any) {
          this.logger.warn(
            `Telegram sendMessage plain retry failed: ${err2?.message || err2}`,
          );
        }
      }
      return { ok: false };
    }
  }

  async sendPhoto(
    botToken: string,
    chatId: string | number,
    imageDataUrl: string,
    caption: string,
    extra?: Record<string, unknown>,
  ): Promise<{ ok: boolean; messageId?: number }> {
    try {
      const parsed = this.parseDataUrl(imageDataUrl);
      if (!parsed) {
        return this.sendMessage(botToken, chatId, caption, extra);
      }
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', applyBotKeyboardWidth(caption, extra, 1024));
      form.append('parse_mode', 'HTML');
      form.append(
        'photo',
        new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mime }),
        parsed.mime.includes('png') ? 'receipt.png' : 'receipt.jpg',
      );
      if (extra?.reply_markup) {
        form.append('reply_markup', JSON.stringify(extra.reply_markup));
      }
      const res: any = await this.telegramHttp.postTelegramForm(botToken, 'sendPhoto', form, 30_000);
      const messageId = Number(res?.result?.message_id || res?.message_id || 0) || undefined;
      return { ok: true, messageId };
    } catch (err: any) {
      const detail = err?.message || String(err);
      this.logger.warn(`Telegram sendPhoto failed: ${detail}`);
      return this.sendMessage(botToken, chatId, caption, extra);
    }
  }

  private parseDataUrl(dataUrl: string) {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
    if (!m) return null;
    try {
      return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
    } catch {
      return null;
    }
  }

  answerCallback(botToken: string, callbackQueryId: string, text?: string) {
    return this.telegramHttp
      .postTelegramJson(
        botToken,
        'answerCallbackQuery',
        {
          callback_query_id: callbackQueryId,
          text: text || undefined,
          show_alert: !!text,
        },
        10_000,
      )
      .catch(() => null);
  }

  /**
   * Update an existing bot message in place (text or photo caption).
   * Falls back to sendMessage only if Telegram rejects the edit.
   */
  async editMessage(
    botToken: string,
    chatId: string | number,
    messageId: number,
    text: string,
    extra?: Record<string, unknown>,
  ) {
    const replyMarkup = extra?.reply_markup;
    const outgoing = applyBotKeyboardWidth(text, extra);
    try {
      await this.telegramHttp.postTelegramJson(
        botToken,
        'editMessageText',
        {
          chat_id: chatId,
          message_id: messageId,
          text: outgoing,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
        },
        15_000,
      );
      return true;
    } catch (err: any) {
      const desc = String(err?.message || '');
      // Same content → treat as success (Telegram returns 400 "message is not modified")
      if (desc.toLowerCase().includes('message is not modified')) return true;
      // Photo / media messages: edit caption instead
      try {
        await this.telegramHttp.postTelegramJson(
          botToken,
          'editMessageCaption',
          {
            chat_id: chatId,
            message_id: messageId,
            caption: applyBotKeyboardWidth(text, extra, 1024),
            parse_mode: 'HTML',
            ...(replyMarkup !== undefined ? { reply_markup: replyMarkup } : {}),
          },
          15_000,
        );
        return true;
      } catch (err2: any) {
        const desc2 = String(err2?.message || '');
        if (desc2.toLowerCase().includes('message is not modified')) return true;
        this.logger.warn(`Telegram editMessage failed: ${desc} / ${desc2}`);
        const sent = await this.sendMessage(botToken, chatId, text, extra);
        return sent.ok;
      }
    }
  }

  private async downloadTelegramPhotoDataUrl(
    botToken: string,
    fileId: string,
  ): Promise<string | null> {
    try {
      const fileRes: any = await this.telegramHttp.postTelegramJson(
        botToken,
        'getFile',
        { file_id: fileId },
        15_000,
      );
      const filePath = fileRes?.result?.file_path;
      if (!filePath) {
        this.logger.warn(`downloadTelegramPhotoDataUrl: getFile missing path for ${fileId}`);
        return null;
      }
      const bytes = await this.telegramHttp.downloadTelegramFile(
        botToken,
        String(filePath),
        30_000,
      );
      if (!bytes.length) return null;
      const ext = String(filePath).toLowerCase();
      const mime = ext.endsWith('.png')
        ? 'image/png'
        : ext.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch (err: any) {
      this.logger.warn(`downloadTelegramPhotoDataUrl failed: ${err?.message || err}`);
      return null;
    }
  }

  /** Marker stored when we keep Telegram file_id instead of embedding bytes. */
  static telegramFileRef(fileId: string) {
    return `tgfile:${fileId}`;
  }

  static parseTelegramFileRef(value: string | null | undefined): string | null {
    const raw = String(value || '').trim();
    if (!raw.toLowerCase().startsWith('tgfile:')) return null;
    const id = raw.slice('tgfile:'.length).trim();
    return id || null;
  }

  async findOrCreateByTelegram(
    adminId: string,
    user: TelegramWebAppUser,
  ): Promise<{ customer: any; created: boolean }> {
    const telegramUserId = String(user.id);
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || null;
    const telegramUsername = user.username || null;
    const telegramHandle = telegramUsername ? `@${telegramUsername}` : null;

    const existing = await this.prisma.storeCustomer.findFirst({
      where: { adminId, telegramUserId },
    });
    if (existing) {
      const customer = await this.prisma.storeCustomer.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          telegram: telegramHandle || existing.telegram,
          telegramUsername: telegramUsername || existing.telegramUsername,
          lastSeenAt: new Date(),
        },
      });
      return { customer, created: false };
    }

    let token = generateCustomerToken();
    while (await this.prisma.storeCustomer.findUnique({ where: { token } })) {
      token = generateCustomerToken();
    }

    let referralCode = generateReferralCode();
    while (await this.prisma.storeCustomer.findUnique({ where: { referralCode } })) {
      referralCode = generateReferralCode();
    }

    const customer = await this.prisma.storeCustomer.create({
      data: {
        adminId,
        token,
        referralCode,
        name,
        telegram: telegramHandle,
        telegramUserId,
        telegramUsername,
        lastSeenAt: new Date(),
      },
    });
    return { customer, created: true };
  }

  async createSessionFromInitData(
    slug: string,
    initData: string,
    requestKey: string,
    context?: { userAgent?: string; ipAddress?: string | null },
  ) {
    this.rateLimit.check('telegramSession', requestKey);
    const store = await this.prisma.storeProfile.findUnique({
      where: { slug },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store?.enabled) throw new NotFoundException('Store not found');
    if (!store.telegramBotEnabled) {
      throw new BadRequestException('Telegram store is disabled for this shop');
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) throw new BadRequestException('Telegram bot token missing');

    const user = this.validateInitData(initData, botToken);
    const { customer, created } = await this.findOrCreateByTelegram(store.adminId, user);
    if (customer.status === 'blocked') throw new UnauthorizedException('Customer blocked');

    if (created && customer.telegramUserId) {
      void this.sendPortalAccessMessage(botToken, customer.telegramUserId, store, customer.token);
    }

    const session = await this.customerAuth.createSession(customer.id, {
      ...context,
      authChannel: 'telegram',
    });
    return {
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      customer: {
        id: customer.id,
        token: customer.token,
        name: customer.name,
        telegramUserId: customer.telegramUserId,
        telegramUsername: customer.telegramUsername,
      },
      store: {
        slug: store.slug,
        title: store.title,
        miniAppUrl: this.buildMiniAppUrl(store),
        shopUrl: this.buildShopUrl(store),
      },
    };
  }

  async sendPortalAccessMessage(
    botToken: string,
    chatId: string | number,
    store: {
      slug: string;
      title: string;
      domain?: { domain: string; status: string } | null;
    },
    customerToken: string,
  ) {
    const shopUrl = this.buildShopUrl(store);
    const lines = [
      `🔑 <b>شناسه ورود وب (فقط مرورگر)</b>`,
      ``,
      `داخل تلگرام دکمه <b>Open</b> را بزنید — نیازی به توکن نیست.`,
      ``,
      `برای ورود از وب/مرورگر این کد را نگه دارید:`,
      `<code>${customerToken}</code>`,
    ];
    if (shopUrl) {
      lines.push(``, `فروشگاه وب:`, shopUrl);
    }
    await this.sendMessage(botToken, chatId, lines.join('\n'), {
      reply_markup: this.storeActionKeyboard(store, { openLabel: '🚀 Open Mini App' }),
    });
  }

  async handleWebhook(slug: string, secret: string, update: any) {
    this.rateLimit.check('telegramWebhook', `${slug}:${secret.slice(0, 8)}`);
    const store = await this.prisma.storeProfile.findUnique({
      where: { slug },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store || !store.telegramBotEnabled) return { ok: true };
    if (!store.telegramWebhookSecret || store.telegramWebhookSecret !== secret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return { ok: true };

    const preCheckout = update?.pre_checkout_query;
    if (preCheckout?.id && this.paymentManagement) {
      try {
        await this.paymentManagement.answerPreCheckout({
          adminId: store.adminId,
          botToken,
          queryId: String(preCheckout.id),
          payload: String(preCheckout.invoice_payload || ''),
          currency: String(preCheckout.currency || ''),
          totalAmount: Number(preCheckout.total_amount || 0),
        });
      } catch (err: any) {
        this.logger.warn(`pre_checkout_query failed: ${err?.message || err}`);
        try {
          await this.telegramHttp.postTelegramJson(
            botToken,
            'answerPreCheckoutQuery',
            {
              pre_checkout_query_id: String(preCheckout.id),
              ok: false,
              error_message: 'Payment could not be verified',
            },
            8_000,
          );
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    }

    const successful = update?.message?.successful_payment;
    if (successful && this.paymentManagement) {
      try {
        const completed = await this.paymentManagement.completeStarsPayment({
          payload: String(successful.invoice_payload || ''),
          telegramPaymentChargeId: String(successful.telegram_payment_charge_id || ''),
          totalAmount: Number(successful.total_amount || 0),
          currency: String(successful.currency || ''),
          telegramUserId: update?.message?.from?.id,
        });
        if (completed.surface === 'add_balance') {
          await this.adminRecharge.fulfillVerifiedStarsRecharge(completed.orderId);
        } else if (completed.surface === 'store' || completed.surface === 'renewal') {
          await this.store.fulfillVerifiedStarsOrder(completed.orderId);
        }
      } catch (err: any) {
        this.logger.warn(`successful_payment failed: ${err?.message || err}`);
      }
      return { ok: true };
    }

    const agencyMenu = await this.agencyCommerce.isAgencyEnabled(store.adminId);
    let paygMenu = false;
    let paygLabel: string | null = null;
    if (this.payg) {
      try {
        const paygSettings = await this.payg.getOrCreateSettings(store.adminId);
        paygMenu = !!paygSettings.botMenuEnabled;
        paygLabel = paygSettings.botButtonLabel ?? null;
      } catch (err: any) {
        this.logger.warn(`PAYG settings load failed: ${err?.message || err}`);
      }
    }
    let digitalMenu = false;
    if (this.features) {
      try {
        digitalMenu = await this.features.canWrite(STORE_DIGITAL_MODULE_ID);
      } catch (err: any) {
        this.logger.warn(`Digital module check failed: ${err?.message || err}`);
      }
    }
    const botMenu = await loadStoreBotMenu(this.prisma, store.adminId);
    const storeCtx = {
      ...store,
      _agencyMenu: agencyMenu,
      _paygMenu: paygMenu,
      _paygLabel: paygLabel,
      _digitalMenu: digitalMenu,
      _buyVpnLabel: (store as { botBuyVpnLabel?: string | null }).botBuyVpnLabel ?? null,
      _buyDigitalLabel:
        (store as { botBuyDigitalLabel?: string | null }).botBuyDigitalLabel ?? null,
      _botMenu: botMenu,
    };

    // Forced-channel membership gate: admins and completed payments pass;
    // everyone else must be a member of store.telegramForceChannel (if set).
    // "gate:joined" and "/start" bypass the cache so joining activates immediately.
    const gateSender = this.extractGateSender(update);
    const gateCallbackData = String(update?.callback_query?.data || '');
    const gateMessageText = String(
      update?.message?.text || update?.message?.caption || '',
    ).trim();
    const gateJoinedTap =
      !!gateSender?.isCallback && gateCallbackData === 'gate:joined';
    const gateStartTap =
      !!gateSender &&
      !gateSender.isCallback &&
      gateMessageText.toLowerCase().startsWith('/start');
    const gateRecheck = gateJoinedTap || gateStartTap;
    if (gateSender && !this.isAdminActor(store.telegramAdminChatId, gateSender.fromId, gateSender.chatId)) {
      const allowed = await this.isChannelMemberAllowed(
        store,
        botToken,
        gateSender.fromId,
        gateRecheck,
      );
      if (!allowed) {
        await this.sendChannelGatePrompt(store, botToken, gateSender, {
          recheck: gateJoinedTap,
          forcePrompt: gateStartTap || gateJoinedTap,
        });
        return { ok: true };
      }
      if (gateJoinedTap) {
        await this.answerCallback(botToken, update.callback_query.id).catch(() => undefined);
        await this.sendCustomerWelcome(
          store,
          storeCtx,
          botToken,
          agencyMenu,
          paygMenu,
          paygLabel,
          update.callback_query.from,
          gateSender.chatId,
        );
        return { ok: true };
      }
      // /start (or other messages) after a successful membership check continue below.
    }

    const callback = update?.callback_query;
    if (callback?.id && callback?.data) {
      const data = String(callback.data || '');
      const fromId = String(callback.from?.id || '');
      const chatId = callback.message?.chat?.id;

      if (data.startsWith('c:agy:')) {
        if (chatId) this.commerce.clearPending(chatId);
        await this.agencyCommerce.handleAgencyCallback({
          botToken,
          storeAdminId: store.adminId,
          chatId: chatId!,
          data,
          callbackId: callback.id,
          messageId: callback.message?.message_id,
          send: (token, cid, text, extra, messageId) =>
            this.replyOrEdit(token, cid, text, extra, messageId),
          answer: (token, id, text) => this.answerCallback(token, id, text),
        });
        return { ok: true };
      }

      if (data === 'c:payg' || data.startsWith('c:payg:')) {
        const user = (callback.from || {}) as TelegramWebAppUser;
        if (!user?.id) return { ok: true };
        const { customer } = await this.findOrCreateByTelegram(store.adminId, user);
        if (customer.status === 'blocked') {
          await this.answerCallback(botToken, callback.id).catch(() => undefined);
          return { ok: true };
        }
        if (chatId) this.commerce.clearPending(chatId);
        await this.commerce.ensureCustomerReferral(customer.id).catch(() => undefined);
        const supportButtons = await this.supportKeyboardButtons(store.adminId);
        await this.commerce.handleCallback({
          botToken,
          callback,
          store: storeCtx,
          customer,
          send: (token, cid, text, extra, messageId) =>
            this.replyOrEdit(token, cid, text, extra, messageId),
          sendPhoto: (token, cid, dataUrl, caption, extra) =>
            this.sendPhoto(token, cid, dataUrl, caption, extra),
          answer: (token, id, text) => this.answerCallback(token, id, text),
          supportButtons,
          miniAppUrl: this.buildMiniAppUrl(store),
          notifyDeposit: (payload) => this.notifyAdminWalletDeposit(payload),
          resolveSubUrl: (subId) => this.resolveCustomerSubUrl(store, subId),
          buildQr: (text) => this.buildQrDataUrl(text),
        });
        return { ok: true };
      }

      if (data.startsWith('c:')) {
        const user = (callback.from || {}) as TelegramWebAppUser;
        if (!user?.id) return { ok: true };
        const { customer } = await this.findOrCreateByTelegram(store.adminId, user);
        if (customer.status === 'blocked') {
          // Blocked customer: bot stays silent for messages; clear callback spinners.
          await this.answerCallback(botToken, callback.id).catch(() => undefined);
          return { ok: true };
        }
        await this.commerce.ensureCustomerReferral(customer.id).catch(() => undefined);
        const supportButtons = await this.supportKeyboardButtons(store.adminId);
        await this.commerce.handleCallback({
          botToken,
          callback,
          store: storeCtx,
          customer,
          send: (token, cid, text, extra, messageId) =>
            this.replyOrEdit(token, cid, text, extra, messageId),
          sendPhoto: (token, cid, dataUrl, caption, extra) =>
            this.sendPhoto(token, cid, dataUrl, caption, extra),
          answer: (token, id, text) => this.answerCallback(token, id, text),
          supportButtons,
          miniAppUrl: this.buildMiniAppUrl(store),
          notifyDeposit: (payload) => this.notifyAdminWalletDeposit(payload),
          resolveSubUrl: (subId) => this.resolveCustomerSubUrl(store, subId),
          buildQr: (text) => this.buildQrDataUrl(text),
        });
        return { ok: true };
      }

      // Admin order approve/reject + admin menus
      if (this.isAdminActor(store.telegramAdminChatId, fromId, chatId)) {
        await this.handleAdminCallback(store.adminId, botToken, callback);
      }
      return { ok: true };
    }

    const message = update?.message;
    const text = String(message?.text || message?.caption || '').trim();
    const chatId = message?.chat?.id;
    const from = message?.from as TelegramWebAppUser | undefined;
    if (!chatId || !from?.id) return { ok: true };

    this.markChatDirty(chatId);

    // Customer commerce pending (amount / receipt / top-up) — even if this Telegram
    // user is also the store admin (common when testing).
    {
      const { customer } = await this.findOrCreateByTelegram(store.adminId, from);
      if (customer.status === 'blocked') return { ok: true };
      const photos = Array.isArray(message?.photo) ? message.photo : [];
      const largestPhoto = photos.length ? photos[photos.length - 1] : null;
      const doc = message?.document;
      const docMime = String(doc?.mime_type || '').toLowerCase();
      const documentImageFileId =
        doc?.file_id &&
        (docMime.startsWith('image/') ||
          /\.(jpe?g|png|webp|gif)$/i.test(String(doc?.file_name || '')))
          ? String(doc.file_id)
          : undefined;
      const agencyFirst = this.agencyCommerce.hasPending(chatId);
      if (agencyFirst) {
        const agencyHandled = await this.agencyCommerce.handleAgencyPendingMessage({
          botToken,
          storeAdminId: store.adminId,
          chatId,
          text,
          photoFileId: largestPhoto?.file_id
            ? String(largestPhoto.file_id)
            : documentImageFileId,
          send: (token, cid, msg, extra) => this.sendMessage(token, cid, msg, extra),
          downloadPhoto: (fileId) => this.downloadTelegramPhotoDataUrl(botToken, fileId),
        });
        if (agencyHandled) return { ok: true };
      }

      const pendingHandled = await this.commerce.handlePendingMessage({
        botToken,
        store: storeCtx,
        customer,
        chatId,
        text,
        photoFileId: largestPhoto?.file_id
          ? String(largestPhoto.file_id)
          : documentImageFileId,
        send: (token, cid, msg, extra) => this.sendMessage(token, cid, msg, extra),
        downloadPhoto: (fileId) => this.downloadTelegramPhotoDataUrl(botToken, fileId),
        miniAppUrl: this.buildMiniAppUrl(store),
        notifyDeposit: (payload) => this.notifyAdminWalletDeposit(payload),
      });
      if (pendingHandled) return { ok: true };

      if (!agencyFirst) {
        const agencyHandled = await this.agencyCommerce.handleAgencyPendingMessage({
          botToken,
          storeAdminId: store.adminId,
          chatId,
          text,
          photoFileId: largestPhoto?.file_id
            ? String(largestPhoto.file_id)
            : documentImageFileId,
          send: (token, cid, msg, extra) => this.sendMessage(token, cid, msg, extra),
          downloadPhoto: (fileId) => this.downloadTelegramPhotoDataUrl(botToken, fileId),
        });
        if (agencyHandled) return { ok: true };
      }
    }

    if (
      this.isAdminActor(store.telegramAdminChatId, String(from.id), chatId) &&
      !text.startsWith('/start')
    ) {
      const promptHandled = await this.handleAdminPromptInput(
        store.adminId,
        botToken,
        chatId,
        text,
      );
      if (promptHandled) return { ok: true };

      const handled = await this.handleAdminBroadcastInput(
        store.adminId,
        botToken,
        chatId,
        message,
        text,
      );
      if (handled) return { ok: true };
    }

    if (text.startsWith('/admin') || text.startsWith('/setadmin')) {
      const configured = String(store.telegramAdminChatId || '').trim();
      if (!configured) {
        await this.sendMessage(
          botToken,
          chatId,
          '⛔ شناسه ادمین هنوز در پنل ثبت نشده است.\nاز تنظیمات ربات فروشگاه، Chat ID ادمین را وارد کنید؛ سپس دوباره /admin بزنید.',
        );
        return { ok: true };
      }
      if (!this.isAdminActor(configured, String(from.id), chatId)) {
        await this.sendMessage(
          botToken,
          chatId,
          '⛔ فقط چت‌آیدی ادمین ثبت‌شده در پنل به منوی ادمین دسترسی دارد.',
        );
        return { ok: true };
      }
      await this.sendMessage(
        botToken,
        chatId,
        '✅ منوی ادمین سفارش‌ها فعال است.\nاز /start هم می‌توانید همین منو را باز کنید.',
      );
      await this.sendAdminHome(botToken, chatId, store);
      return { ok: true };
    }

    if (text.startsWith('/start')) {
      const startArg = text.split(/\s+/)[1] || '';
      const { customer } = await this.findOrCreateByTelegram(store.adminId, from);
      if (customer.status === 'blocked') return { ok: true };
      await this.commerce.ensureCustomerReferral(customer.id).catch(() => undefined);
      if (startArg) {
        await this.commerce.handleStartPayload(customer.id, startArg);
      }
      const welcome =
        store.telegramWelcomeText?.trim() || this.defaultWelcomeText(store.title);

      // Store admin: home menu (orders / revenue / open panel)
      if (this.isAdminActor(store.telegramAdminChatId, String(from.id), chatId)) {
        await this.sendAdminHome(botToken, chatId, store);
        return { ok: true };
      }

      await this.sendMessage(botToken, chatId, welcome, {
        reply_markup: this.commerce.mainMenuKeyboard(
          storeCtx,
          this.buildMiniAppUrl(store),
          { agencyMenu, paygMenu, paygLabel },
        ),
      });
    }

    return { ok: true };
  }

  /** Sender identity used by the forced-channel gate (callback or message). */
  private extractGateSender(update: any): {
    fromId: string;
    chatId?: number;
    isCallback: boolean;
    callbackId?: string;
  } | null {
    const callback = update?.callback_query;
    if (callback?.from?.id != null) {
      return {
        fromId: String(callback.from.id),
        chatId: callback.message?.chat?.id,
        isCallback: true,
        callbackId: callback.id ? String(callback.id) : undefined,
      };
    }
    const from = update?.message?.from;
    const chatId = update?.message?.chat?.id;
    if (from?.id != null && chatId != null) {
      return { fromId: String(from.id), chatId, isCallback: false };
    }
    return null;
  }

  /** Normalizes "@chan", "https://t.me/chan" or a numeric chat id. */
  private normalizeChannelRef(raw: string): string {
    return normalizeChannelRef(raw);
  }

  private async isChannelMemberAllowed(
    store: { adminId: string; telegramForceChannel?: string | null; telegramBotLocale?: string | null },
    botToken: string,
    fromId: string,
    force = false,
  ): Promise<boolean> {
    const channel = normalizeChannelRef(String((store as any).telegramForceChannel || ''));
    if (!channel) return true;

    const cacheKey = `${store.adminId}:${channel}:${fromId}`;
    if (force) this.channelGateCache.invalidate(cacheKey);
    const cached = this.channelGateCache.get(cacheKey);
    if (cached !== null) return cached;

    const member = await isChannelMember(
      (method, body) =>
        this.telegramHttp.postTelegramJson(botToken, method, body, 8_000),
      channel,
      fromId,
    );
    if (!member) {
      this.logger.debug(
        `Channel gate denies ${channel}:${fromId} (bot may lack admin rights in the channel)`,
      );
    }
    this.channelGateCache.set(cacheKey, member);
    return member;
  }

  private async sendChannelGatePrompt(
    store: { adminId: string; telegramForceChannel?: string | null; telegramBotLocale?: string | null },
    botToken: string,
    sender: { fromId: string; chatId?: number; isCallback: boolean; callbackId?: string },
    opts: { recheck?: boolean; forcePrompt?: boolean } | boolean = false,
  ): Promise<void> {
    const recheck = typeof opts === 'boolean' ? opts : !!opts.recheck;
    const forcePrompt = typeof opts === 'boolean' ? false : !!opts.forcePrompt;
    const locale = normalizeBotLocale((store as any).telegramBotLocale);
    const channel = normalizeChannelRef(String((store as any).telegramForceChannel || ''));
    const promptKey = `${store.adminId}:${channel}:${sender.fromId}`;

    // Answer callbacks always (clears the spinner); throttle chat prompts to 30s
    // unless this is /start or "I joined" (those must always get a visible reply).
    let answered = false;
    if (sender.isCallback && sender.callbackId) {
      answered = true;
      await this.answerCallback(
        botToken,
        sender.callbackId,
        recheck ? botT(locale, 'gate.stillNotMember') : undefined,
      ).catch(() => undefined);
    }
    const lastPrompt = this.channelGatePromptAt.get(promptKey) || 0;
    const throttleMs = recheck ? 3_000 : 30_000;
    if (!forcePrompt && Date.now() - lastPrompt < throttleMs) return;
    this.channelGatePromptAt.set(promptKey, Date.now());

    const url = await this.resolveChannelJoinLink(store.adminId, botToken, channel);
    const keyboard = {
      inline_keyboard: [
        ...(url ? [[{ text: botT(locale, 'gate.joinChannel'), url }]] : []),
        [{ text: botT(locale, 'gate.iJoined'), callback_data: 'gate:joined' }],
      ],
    };
    const text = botT(locale, 'gate.channelRequired');
    if (sender.chatId != null) {
      await this.sendMessage(botToken, sender.chatId, text, { reply_markup: keyboard });
    } else if (!answered && sender.isCallback && sender.callbackId) {
      await this.answerCallback(botToken, sender.callbackId, text).catch(() => undefined);
    }
  }

  /** Welcomes a user who just passed the forced-channel gate ("✅ عضو شدم"). */
  private async sendCustomerWelcome(
    store: any,
    storeCtx: any,
    botToken: string,
    agencyMenu: boolean,
    paygMenu: boolean,
    paygLabel: string | null,
    from: any,
    chatId?: number,
  ): Promise<void> {
    if (!chatId || !from?.id) return;
    const user = from as TelegramWebAppUser;
    const { customer } = await this.findOrCreateByTelegram(store.adminId, user);
    if (customer.status === 'blocked') return;
    await this.commerce.ensureCustomerReferral(customer.id).catch(() => undefined);
    const welcome =
      store.telegramWelcomeText?.trim() || this.defaultWelcomeText(store.title);
    await this.sendMessage(botToken, chatId, welcome, {
      reply_markup: this.commerce.mainMenuKeyboard(
        storeCtx,
        this.buildMiniAppUrl(store),
        { agencyMenu, paygMenu, paygLabel },
      ),
    });
  }

  /** Public @username channels get a t.me link; private channels get an invite link. */
  private async resolveChannelJoinLink(
    adminId: string,
    botToken: string,
    channel: string,
  ): Promise<string | null> {
    if (!channel) return null;
    if (!channel.startsWith('-')) return `https://t.me/${channel.replace(/^@/, '')}`;

    const cacheKey = `${adminId}:${channel}`;
    const cached = this.channelLinkCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    let url: string | null = null;
    try {
      const chat = await this.telegramHttp.postTelegramJson(
        botToken,
        'getChat',
        { chat_id: channel },
        8_000,
      );
      if (chat?.result?.username) {
        url = `https://t.me/${chat.result.username}`;
      } else {
        const invite = await this.telegramHttp.postTelegramJson(
          botToken,
          'createChatInviteLink',
          { chat_id: channel },
          8_000,
        );
        url = invite?.result?.invite_link || null;
      }
    } catch {
      url = null;
    }
    this.channelLinkCache.set(cacheKey, { url: url || '', expiresAt: Date.now() + 10 * 60_000 });
    return url;
  }

  private isAdminActor(
    adminChatId: string | null | undefined,
    fromId: string,
    chatId: string | number | undefined,
  ) {
    const admin = String(adminChatId || '').trim();
    if (!admin) return false;
    return fromId === admin || String(chatId || '') === admin;
  }

  private async handleAdminCallback(adminId: string, botToken: string, callback: any) {
    const data = String(callback.data || '');
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const callbackId = callback.id;
    const fromId = String(callback.from?.id || '');

    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: {
        id: true,
        title: true,
        slug: true,
        telegramAdminChatId: true,
        domain: { select: { domain: true, status: true } },
      },
    });

    if (!this.isAdminActor(store?.telegramAdminChatId, fromId, chatId)) {
      await this.answerCallback(botToken, callbackId, '⛔ فقط ادمین فروشگاه');
      return;
    }

    const approveMatch = /^approve:(.+)$/.exec(data);
    const rejectMatch = /^reject:(.+)$/.exec(data);

    try {
      if (data === 'admin:home') {
        await this.answerCallback(botToken, callbackId);
        if (chatId) {
          this.adminPromptDrafts.delete(this.adminPromptKey(adminId, chatId));
        }
        if (chatId && store) {
          await this.sendAdminHome(botToken, chatId, { ...store, adminId }, messageId);
        }
        return;
      }
      if (data === 'admin:orders') {
        await this.answerCallback(botToken, callbackId, '📋 سفارش‌ها');
        if (chatId && store) {
          await this.sendAdminOrdersList(botToken, chatId, adminId, store.id, messageId);
        }
        return;
      }
      if (data === 'admin:revenue' || /^admin:rev:y:\d+$/.test(data)) {
        const y = /^admin:rev:y:(\d+)$/.exec(data);
        await this.answerCallback(botToken, callbackId, '💰 درآمد');
        if (chatId) {
          await this.sendAdminRevenue(
            botToken,
            chatId,
            adminId,
            messageId,
            y ? Number(y[1]) : new Date().getFullYear(),
          );
        }
        return;
      }
      if (data === 'admin:products' || data === 'admin:prod:p:0') {
        await this.answerCallback(botToken, callbackId, '📦 محصولات');
        if (chatId) await this.sendAdminProducts(botToken, chatId, adminId, messageId, 0);
        return;
      }
      if (data === 'admin:customers' || data === 'admin:cust:p:0') {
        await this.answerCallback(botToken, callbackId, '👥 مشتریان');
        if (chatId) await this.sendAdminCustomers(botToken, chatId, adminId, messageId, 0);
        return;
      }
      if (data === 'admin:coupons' || data === 'admin:cpn:p:0') {
        await this.answerCallback(botToken, callbackId, '🎟 کوپن‌ها');
        if (chatId) await this.sendAdminCoupons(botToken, chatId, adminId, messageId, 0);
        return;
      }
      if (data === 'admin:wallet' || data === 'admin:wal:p:0') {
        await this.answerCallback(botToken, callbackId, '💳 کیف‌پول');
        if (chatId) await this.sendAdminWallet(botToken, chatId, adminId, messageId, 0);
        return;
      }
      if (data === 'admin:broadcast') {
        await this.answerCallback(botToken, callbackId, '📢 پیام همگانی');
        if (chatId) {
          this.adminPromptDrafts.delete(this.adminPromptKey(adminId, chatId));
          await this.sendBroadcastAudiencePicker(botToken, chatId, adminId, messageId);
        }
        return;
      }

      const prodPage = /^admin:prod:p:(\d+)$/.exec(data);
      if (prodPage && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminProducts(botToken, chatId, adminId, messageId, Number(prodPage[1]) || 0);
        return;
      }
      const prodView = /^admin:prod:v:(.+)$/.exec(data);
      if (prodView && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminProductView(botToken, chatId, adminId, prodView[1], messageId);
        return;
      }
      const prodTog = /^admin:prod:tog:(.+)$/.exec(data);
      if (prodTog && chatId) {
        const products = await this.store.listProducts(adminId);
        const p: any = products.find((x: any) => x.id === prodTog[1]);
        if (!p) {
          await this.answerCallback(botToken, callbackId, 'محصول پیدا نشد');
          return;
        }
        await this.store.updateProduct(adminId, p.id, { visible: p.visible === false });
        await this.answerCallback(
          botToken,
          callbackId,
          p.visible === false ? '👁 نمایش داده شد' : '🙈 مخفی شد',
        );
        await this.sendAdminProductView(botToken, chatId, adminId, p.id, messageId);
        return;
      }
      const prodEdit = /^admin:prod:e:(name|pt|pu|days|tr):(.+)$/.exec(data);
      if (prodEdit && chatId) {
        const field = prodEdit[1] as 'name' | 'pt' | 'pu' | 'days' | 'tr';
        const productId = prodEdit[2];
        const kindMap = {
          name: 'prod_name',
          pt: 'prod_price_toman',
          pu: 'prod_price_usd',
          days: 'prod_days',
          tr: 'prod_traffic',
        } as const;
        const prompts = {
          name: 'نام جدید محصول را بفرستید:',
          pt: 'قیمت تومان را بفرستید (عدد). برای خالی: -',
          pu: 'قیمت دلار را بفرستید (عدد). برای صفر: 0',
          days: 'مدت به روز را بفرستید (مثلا 30):',
          tr: 'ترافیک به گیگابایت را بفرستید. 0 = نامحدود',
        } as const;
        await this.answerCallback(botToken, callbackId);
        await this.startAdminPrompt(
          adminId,
          chatId,
          botToken,
          { kind: kindMap[field], targetId: productId },
          prompts[field],
        );
        return;
      }
      if (data === 'admin:prod:new' && chatId) {
        await this.answerCallback(botToken, callbackId, 'محصول جدید');
        await this.startAdminPrompt(
          adminId,
          chatId,
          botToken,
          { kind: 'prod_new_name' },
          'نام محصول جدید را بفرستید:',
        );
        return;
      }
      const prodNewCat = /^admin:prod:new:cat:(.+)$/.exec(data);
      if (prodNewCat && chatId) {
        const draft = this.adminPromptDrafts.get(this.adminPromptKey(adminId, chatId));
        if (!draft?.meta?.name) {
          await this.answerCallback(botToken, callbackId, 'ابتدا نام را بفرستید');
          return;
        }
        await this.answerCallback(botToken, callbackId);
        this.adminPromptDrafts.set(this.adminPromptKey(adminId, chatId), {
          ...draft,
          meta: { ...draft.meta, categoryId: prodNewCat[1] },
        });
        await this.sendAdminProductProfilePicker(botToken, chatId, adminId, messageId);
        return;
      }
      const prodNewProf = /^admin:prod:new:prof:(.+)$/.exec(data);
      if (prodNewProf && chatId) {
        const draft = this.adminPromptDrafts.get(this.adminPromptKey(adminId, chatId));
        if (!draft?.meta?.name || !draft.meta.categoryId) {
          await this.answerCallback(botToken, callbackId, 'دسته را انتخاب کنید');
          return;
        }
        await this.answerCallback(botToken, callbackId);
        this.adminPromptDrafts.set(this.adminPromptKey(adminId, chatId), {
          ...draft,
          kind: 'prod_new_prices',
          meta: { ...draft.meta, profileId: prodNewProf[1] },
        });
        await this.sendMessage(
          botToken,
          chatId,
          [
            'قیمت و مشخصات را در یک خط بفرستید:',
            '<code>تومان دلار روز گیگ</code>',
            'مثال: <code>250000 0 30 50</code>',
            'گیگ 0 = ترافیک نامحدود',
            '',
            'برای لغو: /cancel',
          ].join('\n'),
        );
        return;
      }

      const custPage = /^admin:cust:p:(\d+)$/.exec(data);
      if (custPage && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminCustomers(botToken, chatId, adminId, messageId, Number(custPage[1]) || 0);
        return;
      }
      const custView = /^admin:cust:v:(.+)$/.exec(data);
      if (custView && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminCustomerView(botToken, chatId, adminId, custView[1], messageId);
        return;
      }
      const custEdit = /^admin:cust:e:(name|wa|tg|note|msg|wal):(.+)$/.exec(data);
      if (custEdit && chatId) {
        const field = custEdit[1] as 'name' | 'wa' | 'tg' | 'note' | 'msg' | 'wal';
        const customerId = custEdit[2];
        const kindMap = {
          name: 'cust_name',
          wa: 'cust_wa',
          tg: 'cust_tg',
          note: 'cust_note',
          msg: 'cust_msg',
          wal: 'wal_adjust',
        } as const;
        const prompts = {
          name: 'نام جدید مشتری را بفرستید:',
          wa: 'شماره واتساپ/موبایل را بفرستید (مثلا 0912... یا +98912...):\nبرای پاک کردن بنویسید: -',
          tg: 'یوزرنیم تلگرام را بدون @ بفرستید:\nبرای پاک کردن بنویسید: -',
          note: 'یادداشت مشتری را بفرستید:\nبرای پاک کردن بنویسید: -',
          msg: 'متن پیام برای ارسال به مشتری را بفرستید:',
          wal: 'مبلغ تنظیم کیف‌پول را بفرستید.\nمثبت = شارژ · منفی = کسر\nمثال: 100000 یا -50000\nبرای تومان پیشوند t: مثل t:50000',
        } as const;
        await this.answerCallback(botToken, callbackId);
        await this.startAdminPrompt(
          adminId,
          chatId,
          botToken,
          { kind: kindMap[field], targetId: customerId },
          prompts[field],
        );
        return;
      }

      const cpnPage = /^admin:cpn:p:(\d+)$/.exec(data);
      if (cpnPage && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminCoupons(botToken, chatId, adminId, messageId, Number(cpnPage[1]) || 0);
        return;
      }
      const cpnView = /^admin:cpn:v:(.+)$/.exec(data);
      if (cpnView && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminCouponView(botToken, chatId, adminId, cpnView[1], messageId);
        return;
      }
      if (data === 'admin:cpn:new' && chatId) {
        await this.answerCallback(botToken, callbackId, 'ساخت کوپن');
        await this.startAdminPrompt(
          adminId,
          chatId,
          botToken,
          { kind: 'cpn_code' },
          'کد کوپن را بفرستید (مثلا SUMMER20):',
        );
        return;
      }
      const cpnTog = /^admin:cpn:tog:(.+)$/.exec(data);
      if (cpnTog && chatId) {
        const c = await this.prisma.storeCoupon.findFirst({
          where: { id: cpnTog[1], adminId },
        });
        if (!c) {
          await this.answerCallback(botToken, callbackId, 'کوپن پیدا نشد');
          return;
        }
        await this.patchCoupon(adminId, c.id, { enabled: !c.enabled });
        await this.answerCallback(botToken, callbackId, c.enabled ? '⏸ غیرفعال' : '✅ فعال');
        await this.sendAdminCouponView(botToken, chatId, adminId, c.id, messageId);
        return;
      }
      const cpnMax = /^admin:cpn:max:([+-]):(.+)$/.exec(data);
      if (cpnMax && chatId) {
        const dir = cpnMax[1];
        const c = await this.prisma.storeCoupon.findFirst({
          where: { id: cpnMax[2], adminId },
        });
        if (!c) {
          await this.answerCallback(botToken, callbackId, 'کوپن پیدا نشد');
          return;
        }
        let next: number | null = c.maxUses;
        if (dir === '+') {
          next = c.maxUses == null ? Math.max(c.usedCount + 1, 1) : Number(c.maxUses) + 1;
        } else if (c.maxUses == null) {
          next = null;
        } else if (Number(c.maxUses) <= c.usedCount) {
          next = null;
        } else {
          next = Math.max(c.usedCount, Number(c.maxUses) - 1);
          if (next <= 0) next = null;
        }
        await this.patchCoupon(adminId, c.id, { maxUses: next });
        await this.answerCallback(
          botToken,
          callbackId,
          next == null ? 'سقف: نامحدود' : `سقف: ${next}`,
        );
        await this.sendAdminCouponView(botToken, chatId, adminId, c.id, messageId);
        return;
      }
      const cpnMaxSet = /^admin:cpn:maxset:(.+)$/.exec(data);
      if (cpnMaxSet && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.startAdminPrompt(
          adminId,
          chatId,
          botToken,
          { kind: 'cpn_max', targetId: cpnMaxSet[1] },
          'سقف مصرف کوپن را بفرستید (عدد).\nبرای نامحدود بنویسید: -',
        );
        return;
      }
      const cpnDel = /^admin:cpn:del:(.+)$/.exec(data);
      if (cpnDel && chatId) {
        await this.coupons.remove(adminId, cpnDel[1]);
        await this.answerCallback(botToken, callbackId, '🗑 حذف شد');
        await this.sendAdminCoupons(botToken, chatId, adminId, messageId, 0);
        return;
      }

      const walPage = /^admin:wal:p:(\d+)$/.exec(data);
      if (walPage && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminWallet(botToken, chatId, adminId, messageId, Number(walPage[1]) || 0);
        return;
      }
      const walView = /^admin:wal:v:(.+)$/.exec(data);
      if (walView && chatId) {
        await this.answerCallback(botToken, callbackId);
        await this.sendAdminWalletView(botToken, chatId, adminId, walView[1], messageId);
        return;
      }
      const walOk = /^admin:wal:ok:(.+)$/.exec(data);
      if (walOk && chatId) {
        try {
          const deposit = await this.wallet.approveDeposit(adminId, walOk[1]);
          const bal = await this.wallet.getBalance(deposit.customerId, deposit.currency);
          await this.notifyCustomerWalletDepositResult({
            customerId: deposit.customerId,
            approved: true,
            amount: deposit.amount,
            currency: deposit.currency,
            balance: bal.balance,
          });
          await this.answerCallback(botToken, callbackId, '✅ تأیید شد');
          await this.sendAdminWallet(botToken, chatId, adminId, messageId, 0);
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }
      const walNo = /^admin:wal:no:(.+)$/.exec(data);
      if (walNo && chatId) {
        try {
          const deposit = await this.wallet.rejectDeposit(adminId, walNo[1], 'Rejected by admin');
          await this.notifyCustomerWalletDepositResult({
            customerId: deposit.customerId,
            approved: false,
            amount: deposit.amount,
            currency: deposit.currency,
            reason: deposit.rejectReason || undefined,
          });
          await this.answerCallback(botToken, callbackId, '❌ رد شد');
          await this.sendAdminWallet(botToken, chatId, adminId, messageId, 0);
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }

      const arcApprove = /^admin:arc:approve:(.+)$/.exec(data);
      if (arcApprove) {
        const orderId = arcApprove[1];
        try {
          await this.adminRecharge.approveOrder(adminId, orderId);
          await this.answerCallback(botToken, callbackId, '✅ سفارش نمایندگی تأیید شد');
          if (chatId && messageId) {
            await this.replyOrEdit(
              botToken,
              chatId,
              '✅ <b>سفارش افزایش اعتبار تأیید شد.</b>',
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
                },
              },
              messageId,
            );
          }
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }

      const arcReject = /^admin:arc:reject:(.+)$/.exec(data);
      if (arcReject) {
        const orderId = arcReject[1];
        try {
          await this.adminRecharge.rejectOrder(adminId, orderId, 'Rejected via store bot');
          await this.answerCallback(botToken, callbackId, '❌ رد شد');
          if (chatId && messageId) {
            await this.replyOrEdit(
              botToken,
              chatId,
              '❌ <b>سفارش افزایش اعتبار رد شد.</b>',
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
                },
              },
              messageId,
            );
          }
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }

      const wdepOk = /^admin:wdep:ok:(.+)$/.exec(data);
      if (wdepOk) {
        const depositId = wdepOk[1];
        try {
          const deposit = await this.wallet.approveDeposit(adminId, depositId);
          const bal = await this.wallet.getBalance(
            deposit.customerId,
            deposit.currency,
          );
          await this.notifyCustomerWalletDepositResult({
            customerId: deposit.customerId,
            approved: true,
            amount: deposit.amount,
            currency: deposit.currency,
            balance: bal.balance,
          });
          await this.answerCallback(botToken, callbackId, '✅ شارژ تأیید شد');
          if (chatId && messageId) {
            await this.replyOrEdit(
              botToken,
              chatId,
              `✅ شارژ کیف پول تأیید شد\nمبلغ: <b>${formatBotMoney('fa', deposit.amount, deposit.currency)}</b>`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
                },
              },
              messageId,
            );
          }
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }

      const wdepNo = /^admin:wdep:no:(.+)$/.exec(data);
      if (wdepNo) {
        const depositId = wdepNo[1];
        try {
          const deposit = await this.wallet.rejectDeposit(adminId, depositId, 'Rejected by admin');
          await this.notifyCustomerWalletDepositResult({
            customerId: deposit.customerId,
            approved: false,
            amount: deposit.amount,
            currency: deposit.currency,
            reason: deposit.rejectReason || undefined,
          });
          await this.answerCallback(botToken, callbackId, '❌ رد شد');
          if (chatId && messageId) {
            await this.replyOrEdit(
              botToken,
              chatId,
              `❌ درخواست شارژ رد شد`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
                },
              },
              messageId,
            );
          }
        } catch (err: any) {
          await this.answerCallback(
            botToken,
            callbackId,
            String(err?.message || 'خطا').slice(0, 180),
          );
        }
        return;
      }

      if (data.startsWith('broadcast:aud:')) {
        const audience = data.replace('broadcast:aud:', '') as BroadcastAudience;
        if (!['all', 'with_service', 'without_service'].includes(audience)) {
          await this.answerCallback(botToken, callbackId, '⛔ نامعتبر');
          return;
        }
        await this.answerCallback(botToken, callbackId);
        if (chatId) {
          this.broadcastDrafts.set(this.broadcastDraftKey(adminId, chatId), {
            adminId,
            audience,
            text: '',
          });
          const count = await this.countBroadcastRecipients(adminId, audience);
          await this.replyOrEdit(
            botToken,
            chatId,
            [
              '📢 <b>پیام همگانی</b>',
              ``,
              `مخاطب: <b>${this.audienceLabel(audience)}</b> (${count} نفر)`,
              ``,
              `متن پیام را بفرستید (فارسی/انگلیسی/ایموجی).`,
              `برای عکس + کپشن، یک عکس با کپشن ارسال کنید.`,
              ``,
              `برای لغو: /cancel`,
            ].join('\n'),
            {
              reply_markup: {
                inline_keyboard: [[{ text: '❌ لغو', callback_data: 'broadcast:cancel' }]],
              },
            },
            messageId,
          );
        }
        return;
      }
      if (data === 'broadcast:cancel') {
        if (chatId) this.broadcastDrafts.delete(this.broadcastDraftKey(adminId, chatId));
        await this.answerCallback(botToken, callbackId, 'لغو شد');
        if (chatId && store) {
          await this.sendAdminHome(botToken, chatId, { ...store, adminId }, messageId);
        }
        return;
      }
      if (data === 'broadcast:confirm') {
        await this.answerCallback(botToken, callbackId, 'در حال ارسال…');
        if (chatId) {
          const draft = this.broadcastDrafts.get(this.broadcastDraftKey(adminId, chatId));
          if (!draft?.text?.trim()) {
            await this.sendMessage(botToken, chatId, '⚠️ متن پیام خالی است.');
            return;
          }
          const result = await this.executeBroadcast(adminId, botToken, {
            audience: draft.audience,
            text: draft.text,
            photoFileId: draft.photoFileId,
            photoDataUrl: draft.photoDataUrl,
          });
          this.broadcastDrafts.delete(this.broadcastDraftKey(adminId, chatId));
          await this.replyOrEdit(
            botToken,
            chatId,
            [
              '✅ <b>ارسال همگانی انجام شد</b>',
              ``,
              `📤 ارسال موفق: <b>${result.sent}</b>`,
              `⚠️ ناموفق: <b>${result.failed}</b>`,
              `👥 کل مخاطب: <b>${result.total}</b>`,
            ].join('\n'),
            {
              reply_markup: {
                inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
              },
            },
            messageId,
          );
        }
        return;
      }
      if (approveMatch) {
        const orderId = approveMatch[1];
        const before = await this.prisma.storeOrder.findFirst({
          where: { id: orderId, store: { adminId } },
          select: { autoDelivered: true, pendingReview: true, status: true, trackingCode: true },
        });
        await this.store.approveOrder(adminId, 'ADMIN', orderId);
        const after = await this.prisma.storeOrder.findFirst({
          where: { id: orderId, store: { adminId } },
          select: { status: true },
        });
        const confirmed =
          before?.pendingReview && ['ACTIVE', 'RENEWED'].includes(before.status || '');
        const provisioned = ['ACTIVE', 'RENEWED'].includes(after?.status || '');
        await this.answerCallback(
          botToken,
          callbackId,
          confirmed ? '✅ تأیید نهایی ثبت شد' : '✅ سفارش تأیید شد',
        );
        await this.syncAdminOrderTelegram(
          adminId,
          orderId,
          confirmed
            ? '✅ <b>بررسی سفارش بسته شد — سرویس از قبل فعال بود.</b>'
            : provisioned
              ? '✅ <b>سرویس ساخته شد.</b>'
              : '✅ <b>سفارش تأیید و در صف ساخت سرویس قرار گرفت.</b>',
        );
        return;
      }
      if (rejectMatch) {
        const orderId = rejectMatch[1];
        const before = await this.prisma.storeOrder.findFirst({
          where: { id: orderId, store: { adminId } },
          select: { autoDelivered: true, trackingCode: true },
        });
        await this.store.rejectOrder(adminId, orderId, 'Rejected via Telegram');
        await this.answerCallback(
          botToken,
          callbackId,
          before?.autoDelivered ? '↩️ رد و برگشت انجام شد' : '❌ سفارش رد شد',
        );
        await this.syncAdminOrderTelegram(
          adminId,
          orderId,
          before?.autoDelivered
            ? '↩️ <b>سفارش رد شد و تحویل خودکار برگشت داده شد.</b>'
            : '❌ <b>سفارش رد شد.</b>',
        );
        return;
      }
      await this.answerCallback(botToken, callbackId);
    } catch (err: any) {
      const msg = String(err?.message || err || 'Action failed').slice(0, 180);
      await this.answerCallback(botToken, callbackId, msg);
      if (chatId && messageId) {
        await this.editMessage(botToken, chatId, messageId, `⚠️ ${this.escapeHtml(msg)}`, {
          reply_markup: {
            inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
          },
        });
      } else if (chatId) {
        await this.sendMessage(botToken, chatId, `⚠️ ${msg}`);
      }
    }
  }

  private async clearInlineKeyboard(
    botToken: string,
    chatId?: string | number,
    messageId?: number,
  ) {
    if (!chatId || !messageId) return;
    try {
      await this.telegramHttp.postTelegramJson(
        botToken,
        'editMessageReplyMarkup',
        { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } },
        10_000,
      );
    } catch {
      /* ignore */
    }
  }

  async notifyAdminWalletDeposit(input: {
    adminId: string;
    customerId: string;
    amount: number;
    currency: string;
    depositId: string;
    receiptImage?: string | null;
    receiptText?: string | null;
  }) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: input.adminId },
    });
    if (!store?.telegramBotEnabled || !store.telegramAdminChatId) {
      this.logger.warn(
        `notifyAdminWalletDeposit: bot/admin chat missing for admin ${input.adminId}`,
      );
      return;
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return;

    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: input.customerId },
      select: {
        name: true,
        telegram: true,
        telegramUsername: true,
        telegramUserId: true,
        token: true,
      },
    });
    const who =
      customer?.name ||
      customer?.telegram ||
      (customer?.telegramUsername ? `@${customer.telegramUsername}` : null) ||
      customer?.token?.slice(0, 8) ||
      input.customerId.slice(0, 8);
    const amountLabel = formatBotMoney('fa', input.amount, input.currency);
    const receiptNote = String(input.receiptText || '').trim();
    const caption = [
      `💰 <b>درخواست شارژ کیف پول</b>`,
      `مشتری: ${this.escapeHtml(String(who))}`,
      customer?.telegramUserId
        ? `آیدی تلگرام: <code>${this.escapeHtml(String(customer.telegramUserId))}</code>`
        : null,
      `مبلغ: <b>${amountLabel}</b>`,
      `کد: <code>${this.escapeHtml(input.depositId)}</code>`,
      `وضعیت: منتظر تأیید`,
      receiptNote
        ? `\n📝 متن رسید:\n${this.escapeHtml(receiptNote).slice(0, 500)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ تأیید شارژ', callback_data: `admin:wdep:ok:${input.depositId}` },
          { text: '❌ رد', callback_data: `admin:wdep:no:${input.depositId}` },
        ],
        [{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }],
      ],
    };

    if (input.receiptImage) {
      const tgFileId = StoreTelegramService.parseTelegramFileRef(input.receiptImage);
      if (tgFileId) {
        const ok = await this.sendPhotoByFileId(
          botToken,
          store.telegramAdminChatId,
          tgFileId,
          caption.slice(0, 1024),
          { reply_markup: keyboard },
        );
        if (ok) return;
      } else {
        const sent = await this.sendPhoto(
          botToken,
          store.telegramAdminChatId,
          input.receiptImage,
          caption.slice(0, 1024),
          { reply_markup: keyboard },
        );
        if (sent.ok) return;
      }
    }
    await this.sendMessage(botToken, store.telegramAdminChatId, caption, {
      reply_markup: keyboard,
    });
  }

  async notifyCustomerWalletDepositResult(input: {
    customerId: string;
    approved: boolean;
    amount: number;
    currency: string;
    balance?: number;
    reason?: string;
  }) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: input.customerId },
      select: {
        telegramUserId: true,
        adminId: true,
      },
    });
    if (!customer?.telegramUserId) return;
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
      select: {
        telegramBotEnabled: true,
        telegramBotTokenEnc: true,
        telegramBotLocale: true,
        defaultCurrency: true,
        slug: true,
        domain: { select: { domain: true, status: true } },
      },
    });
    if (!store?.telegramBotEnabled) return;
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return;
    const loc =
      String((store as any).telegramBotLocale || 'fa').toLowerCase() === 'en'
        ? 'en'
        : 'fa';
    const cur = normalizeWalletCurrency(input.currency || store.defaultCurrency);
    const text = input.approved
      ? botT(loc, 'wallet.approved', {
          amount: formatBotMoney(loc, input.amount, cur),
          balance: formatBotMoney(loc, input.balance ?? 0, cur),
        })
      : botT(loc, 'wallet.rejected', {
          reason: input.reason ? `\n${input.reason}` : '',
        });
    await this.sendMessage(botToken, customer.telegramUserId, text, {
      reply_markup: this.commerce.mainMenuKeyboard(store as any, this.buildMiniAppUrl(store as any)),
    });
  }

  async notifyAdminNewOrder(adminId: string, orderId: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store?.telegramBotEnabled) {
      this.logger.warn(`notifyAdminNewOrder: bot disabled for admin ${adminId}`);
      return false;
    }
    if (!store.telegramAdminChatId) {
      this.logger.warn(
        `notifyAdminNewOrder: no telegramAdminChatId — set Admin Chat ID in store bot settings`,
      );
      return false;
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) {
      this.logger.warn(`notifyAdminNewOrder: bot token decrypt failed for admin ${adminId}`);
      return false;
    }

    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, store: { adminId } },
      include: {
        product: { select: { name: true, isTest: true, category: { select: { name: true } } } },
        customer: {
          select: {
            name: true,
            telegram: true,
            telegramUsername: true,
            telegramUserId: true,
          },
        },
        payment: {
          select: { receiptText: true, receiptImage: true, amount: true, currency: true },
        },
        renewClient: { select: StoreTelegramService.adminOrderClientSelect },
        client: { select: StoreTelegramService.adminOrderClientSelect },
      },
    });
    if (!order) return false;

    const paidWithWallet =
      String(order.payment?.method || '').toUpperCase() === 'WALLET';
    const hasReceipt = !!(order.payment?.receiptText || order.payment?.receiptImage || paidWithWallet);
    const approveLabel = order.autoDelivered
      ? '✅ تأیید نهایی'
      : '✅ تأیید و فعال‌سازی';
    const rejectLabel = order.autoDelivered
      ? '↩️ رد و برگشت'
      : '❌ رد';
    const keyboard = hasReceipt
      ? {
          inline_keyboard: [
            [
              { text: approveLabel, callback_data: `approve:${order.id}` },
              { text: rejectLabel, callback_data: `reject:${order.id}` },
            ],
          ],
        }
      : {
          inline_keyboard: [
            [{ text: '❌ رد سفارش', callback_data: `reject:${order.id}` }],
          ],
        };

    const caption = this.buildAdminOrderBody(order, store, {
      title: hasReceipt
        ? '🛎️ <b>سفارش جدید — نیاز به بررسی</b>'
        : '🛎️ <b>سفارش جدید — بدون رسید</b>',
    });

    // Prefer a single message: receipt photo + order details as caption (+ buttons).
    let sent: { ok: boolean; messageId?: number } = { ok: false };
    let hasPhoto = false;
    const receiptImage = order.payment?.receiptImage || '';
    const tgFileId = StoreTelegramService.parseTelegramFileRef(receiptImage);
    if (tgFileId) {
      const ok = await this.sendPhotoByFileId(
        botToken,
        store.telegramAdminChatId,
        tgFileId,
        caption,
        { reply_markup: keyboard },
      );
      sent = { ok };
      hasPhoto = ok;
      if (ok) {
        this.logger.log(
          `notifyAdminNewOrder: sent file_id photo+caption for order ${order.trackingCode} → chat ${store.telegramAdminChatId}`,
        );
      } else {
        this.logger.warn(
          `notifyAdminNewOrder: file_id photo failed for ${orderId}; falling back to text`,
        );
      }
    } else if (receiptImage) {
      sent = await this.sendPhoto(
        botToken,
        store.telegramAdminChatId,
        receiptImage,
        caption,
        { reply_markup: keyboard },
      );
      hasPhoto = !!sent.ok;
      if (sent.ok) {
        this.logger.log(
          `notifyAdminNewOrder: sent photo+caption for order ${order.trackingCode} → chat ${store.telegramAdminChatId}`,
        );
      } else {
        this.logger.warn(
          `notifyAdminNewOrder: photo+caption failed for ${orderId}; falling back to text`,
        );
      }
    }

    if (!sent.ok) {
      sent = await this.sendMessage(botToken, store.telegramAdminChatId, caption, {
        reply_markup: keyboard,
      });
      hasPhoto = false;
    }
    if (!sent.ok) {
      this.logger.warn(
        `notifyAdminNewOrder: sendMessage failed for order ${orderId} chat=${store.telegramAdminChatId}`,
      );
      return false;
    }

    if (sent.messageId) {
      await this.prisma.storeOrder.update({
        where: { id: order.id },
        data: {
          telegramAdminChatId: String(store.telegramAdminChatId),
          telegramAdminMessageId: sent.messageId,
          telegramAdminHasPhoto: hasPhoto,
        },
      });
    }

    this.logger.log(`notifyAdminNewOrder: sent for order ${order.trackingCode} → chat ${store.telegramAdminChatId}`);
    return true;
  }

  async notifyAdminAgencyOrder(
    adminId: string,
    input: {
      orderId: string;
      trackingCode: string;
      amount: number;
      currency: string;
      adminUsername: string;
      planName: string;
      paymentMethod: string;
      orderKind?: string;
      receiptImage?: string | null;
      receiptText?: string | null;
    },
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: {
        telegramBotEnabled: true,
        telegramBotTokenEnc: true,
        telegramAdminChatId: true,
      },
    });
    if (!store?.telegramBotEnabled || !store.telegramAdminChatId) {
      this.logger.warn(
        `notifyAdminAgencyOrder: bot/admin chat missing for admin ${adminId}`,
      );
      return false;
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return false;

    const kindLabel =
      input.orderKind === 'NEW_AGENCY' ? ' · نمایندگی جدید' : ' · شارژ نمایندگی';
    const receiptNote = String(input.receiptText || '').trim();
    const caption = [
      `🏢 <b>درخواست نمایندگی</b>${kindLabel}`,
      '',
      `کد: <code>${this.escapeHtml(input.trackingCode)}</code>`,
      `کاربر: <b>${this.escapeHtml(input.adminUsername)}</b>`,
      `پلن: ${this.escapeHtml(input.planName)}`,
      `مبلغ: <b>${Number(input.amount || 0).toLocaleString()}</b> ${this.escapeHtml(input.currency || '')}`,
      `روش: ${this.escapeHtml(input.paymentMethod)}`,
      receiptNote
        ? `\n📝 متن رسید:\n${this.escapeHtml(receiptNote).slice(0, 400)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ تأیید', callback_data: `admin:arc:approve:${input.orderId}` },
          { text: '❌ رد', callback_data: `admin:arc:reject:${input.orderId}` },
        ],
        [{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }],
      ],
    };

    if (input.receiptImage) {
      const tgFileId = StoreTelegramService.parseTelegramFileRef(input.receiptImage);
      if (tgFileId) {
        const ok = await this.sendPhotoByFileId(
          botToken,
          store.telegramAdminChatId,
          tgFileId,
          caption.slice(0, 1024),
          { reply_markup: keyboard },
        );
        if (ok) return true;
      } else {
        const sent = await this.sendPhoto(
          botToken,
          store.telegramAdminChatId,
          input.receiptImage,
          caption.slice(0, 1024),
          { reply_markup: keyboard },
        );
        if (sent.ok) return true;
      }
    }

    const sent = await this.sendMessage(botToken, store.telegramAdminChatId, caption, {
      reply_markup: keyboard,
    });
    return sent.ok;
  }

  async sendStoreCustomerMessage(
    adminId: string,
    chatId: string | number,
    text: string,
    extra?: Record<string, unknown>,
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: { telegramBotEnabled: true, telegramBotTokenEnc: true },
    });
    if (!store?.telegramBotEnabled) return false;
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return false;
    const sent = await this.sendMessage(botToken, chatId, text, extra);
    return sent.ok;
  }

  /**
   * After auto-delivery: edit the same order message (no second ping).
   */
  async notifyAdminAutoDeliveredReview(adminId: string, orderId: string) {
    return this.syncAdminOrderTelegram(
      adminId,
      orderId,
      '⚡️ <b>تحویل خودکار انجام شد</b> — تأیید نهایی یا رد کنید.',
      { keepActions: true },
    );
  }

  private static readonly adminOrderClientSelect = {
    email: true,
    remark: true,
    subId: true,
    providerMeta: true,
    panel: { select: { subUrl: true, url: true, panelType: true } },
  } as const;

  private httpsSubUrl(value: unknown): string | null {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : null;
  }

  private providerMetaSubUrl(meta: unknown): string | null {
    if (!meta || typeof meta !== 'object') return null;
    const rec = meta as Record<string, unknown>;
    return this.httpsSubUrl(rec.subscriptionUrl || rec.sub_url || rec.subscription_url);
  }

  /** 3x-ui uses `/s/{subId}`; Eylan/Pasarguard live on fulfillment / providerMeta. */
  private resolveAdminOrderSubUrl(order: any, store: any): string | null {
    const parsed = parseFulfillment(order.fulfillment);
    const rawFf =
      order.fulfillment && typeof order.fulfillment === 'object'
        ? (order.fulfillment as { subUrl?: unknown }).subUrl
        : null;
    const ffUrl = this.httpsSubUrl(parsed?.subUrl) || this.httpsSubUrl(rawFf);
    if (ffUrl) return ffUrl;
    const metaUrl =
      this.providerMetaSubUrl(order.client?.providerMeta) ||
      this.providerMetaSubUrl(order.renewClient?.providerMeta);
    if (metaUrl) return metaUrl;
    const subId = order.renewClient?.subId || order.client?.subId || null;
    const panelHint = order.renewClient?.panel || order.client?.panel || null;
    return this.resolveCustomerSubUrl(store, subId, panelHint);
  }

  private buildAdminOrderBody(
    order: any,
    store: any,
    opts?: { title?: string; statusFooter?: string } | string,
  ) {
    const normalized =
      typeof opts === 'string' ? { statusFooter: opts } : opts || {};
    const paidWithWallet =
      String(order.payment?.method || '').toUpperCase() === 'WALLET';
    const hasReceipt = !!(order.payment?.receiptText || order.payment?.receiptImage || paidWithWallet);
    const kind = order.isRenewal ? '🔄 تمدید' : '🛒 خرید جدید';
    const pendingTag = order.pendingReview
      ? `\n🏷 <b>برچسب:</b> نیاز به تأیید نهایی ادمین`
      : '';
    const autoTag = order.autoDelivered
      ? `\n⚡️ <b>تحویل خودکار انجام شد</b>`
      : '';
    const tgUser = order.customer?.telegramUserId
      ? `<code>${this.escapeHtml(String(order.customer.telegramUserId))}</code>`
      : '—';
    const tgUserName = order.customer?.telegramUsername
      ? `@${this.escapeHtml(order.customer.telegramUsername)}`
      : order.customer?.telegram
        ? this.escapeHtml(order.customer.telegram)
        : '—';
    const customerName = this.escapeHtml(order.customer?.name || '—');
    const amount = Number(order.payment?.amount ?? order.amount ?? 0);
    const currency = (order.payment?.currency || order.currency || '').toUpperCase();
    const amountLabel =
      currency.includes('TOMAN') || currency === 'IRT' || currency === 'IRR'
        ? `${amount.toLocaleString()} تومان`
        : `$${amount}`;
    const productName = this.escapeHtml(order.product?.name || '—');
    const categoryName = order.product?.category?.name
      ? this.escapeHtml(order.product.category.name)
      : '';
    const testTag = order.isTest || order.product?.isTest ? ' · 🧪 تست' : '';
    const serverConfig =
      order.renewClient?.email ||
      order.renewClient?.remark ||
      order.client?.email ||
      order.client?.remark ||
      (order.configName && order.configName !== 'renewal' ? order.configName : null) ||
      '—';
    const configName = this.escapeHtml(serverConfig);
    const subUrl = this.resolveAdminOrderSubUrl(order, store);

    const lines = [
      normalized.title || `🛎️ <b>سفارش — جزئیات</b>`,
      ``,
      this.orderNumberLine(order.trackingCode),
      `${kind}${pendingTag}${autoTag}`,
      `📦 محصول: <b>${productName}</b>${testTag}`,
      ...(categoryName ? [`📂 دسته: <b>${categoryName}</b>`] : []),
      `🏷 کانفیگ: <code>${configName}</code>`,
      `👤 نام: ${customerName}`,
      `🆔 Telegram ID: ${tgUser}`,
      `🔗 Username: ${tgUserName}`,
      `💰 مبلغ: <b>${amountLabel}</b>`,
      `📊 وضعیت: ${this.escapeHtml(String(order.status || '').replace(/_/g, ' '))}`,
    ];
    if (order.limitIp) {
      lines.push(`👥 IP limit: <b>${order.limitIp}</b>`);
    }
    if (subUrl) {
      lines.push(``, `🔗 <b>لینک ساب مشتری</b>`, `<code>${this.escapeHtml(subUrl)}</code>`);
    }
    if (order.payment?.receiptText) {
      lines.push(``, `📝 یادداشت پرداخت:`, this.escapeHtml(order.payment.receiptText).slice(0, 400));
    } else if (paidWithWallet) {
      lines.push(``, `💰 روش پرداخت: پرداخت از موجودی کیف پول`);
    } else if (!hasReceipt) {
      lines.push(``, `⚠️ مشتری هنوز رسید نفرستاده.`);
    }
    if (normalized.statusFooter) lines.push(``, normalized.statusFooter);
    return lines.join('\n');
  }

  async syncAdminOrderTelegram(
    adminId: string,
    orderId: string,
    statusFooter: string,
    opts?: { keepActions?: boolean },
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store?.telegramBotEnabled) return false;
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return false;

    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, store: { adminId } },
      include: {
        product: { select: { name: true, isTest: true, category: { select: { name: true } } } },
        customer: {
          select: {
            name: true,
            telegram: true,
            telegramUsername: true,
            telegramUserId: true,
          },
        },
        payment: {
          select: { receiptText: true, receiptImage: true, amount: true, currency: true },
        },
        renewClient: { select: StoreTelegramService.adminOrderClientSelect },
        client: { select: StoreTelegramService.adminOrderClientSelect },
      },
    });
    if (!order) return false;

    const caption = this.buildAdminOrderBody(order, store, statusFooter);
    const keyboard = opts?.keepActions
      ? {
          inline_keyboard: [
            [
              {
                text: order.autoDelivered ? '✅ تأیید نهایی' : '✅ تأیید و فعال‌سازی',
                callback_data: `approve:${order.id}`,
              },
              {
                text: order.autoDelivered ? '↩️ رد و برگشت' : '❌ رد سفارش',
                callback_data: `reject:${order.id}`,
              },
            ],
          ],
        }
      : {
          inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
        };

    const chatId = order.telegramAdminChatId || store.telegramAdminChatId;
    const messageId = order.telegramAdminMessageId;
    const subUrl = this.resolveAdminOrderSubUrl(order, store);
    const capLimit = order.telegramAdminHasPhoto ? 1024 : 4096;
    const captionForEdit = caption.slice(0, capLimit);
    const urlCutOff = !!subUrl && !captionForEdit.includes(subUrl);

    let ok = false;
    if (chatId && messageId) {
      // Prefer caption edit when the original notify used a receipt photo
      if (order.telegramAdminHasPhoto) {
        try {
          await this.telegramHttp.postTelegramJson(
            botToken,
            'editMessageCaption',
            {
              chat_id: chatId,
              message_id: messageId,
              caption: captionForEdit,
              parse_mode: 'HTML',
              reply_markup: keyboard,
            },
            15_000,
          );
          ok = true;
        } catch {
          /* fall through to generic edit */
        }
      }
      if (!ok) {
        await this.editMessage(botToken, chatId, messageId, caption, { reply_markup: keyboard });
        ok = true;
      }
    } else if (chatId) {
      const sent = await this.sendMessage(botToken, chatId, caption, { reply_markup: keyboard });
      ok = sent.ok;
      if (sent.ok && sent.messageId) {
        await this.prisma.storeOrder.update({
          where: { id: order.id },
          data: {
            telegramAdminChatId: String(chatId),
            telegramAdminMessageId: sent.messageId,
            telegramAdminHasPhoto: false,
          },
        });
      }
    }
    if (ok && urlCutOff && chatId && subUrl) {
      await this.sendMessage(
        botToken,
        chatId,
        `🔗 <b>لینک ساب مشتری</b>\n<code>${this.escapeHtml(subUrl)}</code>`,
      );
    }
    return ok;
  }

  async formatConfigBlock(
    store: { domain?: { domain: string; status: string } | null },
    client?: {
      remark?: string | null;
      email?: string | null;
      subId?: string | null;
      expiryTime?: bigint | number | null;
      total?: bigint | number | null;
      up?: bigint | number | null;
      down?: bigint | number | null;
    } | null,
    trackingCode?: string | null,
    timeZone?: string,
  ) {
    const name = client?.remark || client?.email || 'Service';
    const lines = [`• <b>${name}</b>`];
    if (trackingCode) lines.push(`  ${this.orderNumberLine(trackingCode)}`);
    if (client?.subId) {
      const sub = this.resolveCustomerSubUrl(store, client.subId, (client as any).panel || null);
      if (sub) lines.push(`  🔗 Sub: ${sub}`);
    }
    const expiryMs = Number(client?.expiryTime || 0);
    if (expiryMs > 0) {
      const tz =
        timeZone ||
        String(
          (await this.settings.getSetting('display_timezone', 'Asia/Tehran')) || 'Asia/Tehran',
        );
      lines.push(`  ⏳ Expiry: ${formatDateTimeInTz(expiryMs, tz)}`);
    }
    const total = Number(client?.total || 0);
    if (total > 0) {
      const used = Number(client?.up || 0) + Number(client?.down || 0);
      const leftPct = Math.max(0, Math.round(((total - used) / total) * 100));
      lines.push(`  📊 Traffic left: ~${leftPct}%`);
    }
    return lines.join('\n');
  }

  async notifyTelegramCustomer(
    customerId: string,
    input: {
      title: string;
      message?: string;
      type?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: customerId },
      select: {
        adminId: true,
        telegramUserId: true,
        name: true,
        telegramUsername: true,
        token: true,
      },
    });
    if (!customer?.telegramUserId) return false;

    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
      include: { domain: { select: { domain: true, status: true } } },
    });
    if (!store?.telegramBotEnabled) return false;
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) return false;

    const payload = input.payload || {};
    const trackingCode =
      typeof payload.trackingCode === 'string' ? payload.trackingCode : null;
    const subId = typeof payload.subId === 'string' ? payload.subId : null;
    const payloadSubUrl = typeof payload.subUrl === 'string' ? payload.subUrl : null;
    const status = typeof payload.status === 'string' ? payload.status : null;
    const configName =
      typeof payload.configName === 'string' ? payload.configName : null;
    const serviceName =
      typeof payload.serviceName === 'string' ? payload.serviceName : null;
    const reason = typeof payload.reason === 'string' ? payload.reason : null;

    let nativePanel: { subUrl?: string | null; url?: string | null } | null = null;
    if (subId && store.subscriptionLinkMode === 'native') {
      const client = await this.prisma.client.findFirst({
        where: {
          OR: [{ subId }, { subToken: subId }],
        },
        select: {
          inbound: {
            select: { panel: { select: { subUrl: true, url: true } } },
          },
        },
      });
      nativePanel = client?.inbound?.panel || null;
    }
    let resolvedSubUrl =
      (payloadSubUrl && isNativeEylanSubUrl(payloadSubUrl)
        ? payloadSubUrl
        : null) ||
      (payloadSubUrl && /^https?:\/\//i.test(payloadSubUrl) && !/\/s\//i.test(payloadSubUrl)
        ? payloadSubUrl
        : null) ||
      this.resolveCustomerSubUrl(store, subId, nativePanel);
    const isEylanDelivery =
      isEylanProvider(typeof payload.providerId === 'string' ? payload.providerId : null) ||
      isNativeEylanSubUrl(resolvedSubUrl) ||
      isNativeEylanSubUrl(payloadSubUrl);
    // Prefer native Eylan URL from payload even if absolute-check above skipped /s/ junk.
    if (isEylanDelivery && isNativeEylanSubUrl(payloadSubUrl)) {
      resolvedSubUrl = String(payloadSubUrl).trim();
    }
    if (isEylanDelivery && resolvedSubUrl && /\/s\//i.test(resolvedSubUrl) && !/\/sub\//i.test(resolvedSubUrl)) {
      resolvedSubUrl = null;
    }
    const kindRaw =
      (typeof payload.kind === 'string' && payload.kind) ||
      input.type ||
      (status === 'ACTIVE' || status === 'RENEWED'
        ? 'service_ready'
        : status === 'REJECTED'
          ? 'payment_rejected'
          : status === 'APPROVED'
            ? 'payment_approved'
            : status === 'CANCELLED'
              ? 'order_cancelled'
              : status === 'PROVISION_FAILED'
                ? 'provision_failed'
                : 'generic');
    const isTestDelivery = kindRaw === 'test_created' || payload.isTest === true;
    const kind = isTestDelivery ? 'test_created' : kindRaw;

    const loc =
      String((store as any).telegramBotLocale || 'fa').toLowerCase() === 'en' ? 'en' : 'fa';
    const bilingual = (fa: string, en: string) => (loc === 'en' ? en : fa);
    const lines: string[] = [];
    const clientId =
      typeof payload.clientId === 'string' && payload.clientId.trim()
        ? payload.clientId.trim()
        : null;
    const remainingBytes =
      typeof payload.remainingBytes === 'number' ? payload.remainingBytes : null;

    switch (kind) {
      case 'test_created': {
        const service = serviceName || configName || (loc === 'en' ? 'service' : 'سرویس');
        const name = configName || service;
        const user =
          String(customer.name || '').trim() ||
          String(customer.telegramUsername || '').trim() ||
          (loc === 'en' ? 'user' : 'کاربر');
        lines.push(
          botT(loc, 'test.created', {
            service: this.escapeHtml(service),
            name: this.escapeHtml(name),
            user: this.escapeHtml(user),
          }),
        );
        break;
      }
      case 'order_submitted':
      case 'renewal_submitted': {
        const isRenewal = !!payload.isRenewal || kind === 'renewal_submitted';
        lines.push(
          bilingual(
            isRenewal ? '✅ <b>درخواست تمدید ثبت شد</b>' : '✅ <b>سفارش ثبت شد</b>',
            isRenewal ? '✅ <b>Renewal submitted</b>' : '✅ <b>Order submitted</b>',
          ),
        );
        if (isRenewal && configName) {
          lines.push(`🏷 <code>${configName}</code>`);
          if (serviceName) lines.push(`📦 ${serviceName}`);
        } else if (serviceName || configName) {
          lines.push(`📦 ${serviceName || configName}`);
        }
        lines.push(
          '',
          bilingual(
            status === 'UNDER_REVIEW' || status === 'PAYMENT_SUBMITTED' || status === 'APPROVED'
              ? 'رسید دریافت شد. سفارش به‌زودی تحویل داده خواهد شد.'
              : 'سفارش ساخته شد — منتظر جزئیات پرداخت.',
            status === 'UNDER_REVIEW' || status === 'PAYMENT_SUBMITTED' || status === 'APPROVED'
              ? 'Receipt received. Your order will be delivered soon.'
              : 'Order created — waiting for payment details.',
          ),
        );
        break;
      }
      case 'payment_approved':
      case 'order_approved': {
        lines.push(bilingual('✅ <b>سفارش تأیید شد</b>', '✅ <b>Order approved</b>'));
        lines.push(
          bilingual(
            'پرداخت تأیید شد؛ در حال ساخت سرویس…',
            'Payment approved — creating your service…',
          ),
        );
        if (configName) lines.push(`🏷 <code>${configName}</code>`);
        break;
      }
      case 'payment_rejected': {
        lines.push(bilingual('❌ <b>سفارش رد شد</b>', '❌ <b>Order rejected</b>'));
        lines.push(
          bilingual(
            reason || 'پرداخت رد شد. با پشتیبانی تماس بگیرید یا با رسید جدید تلاش کنید.',
            reason ||
              'Your payment was rejected. Contact support or retry with a new receipt.',
          ),
        );
        if (configName && configName !== 'renewal') lines.push(`📦 <b>${configName}</b>`);
        break;
      }
      case 'order_cancelled_by_admin': {
        lines.push(
          bilingual('🚫 <b>سفارش توسط ادمین لغو شد</b>', '🚫 <b>Order cancelled by admin</b>'),
        );
        lines.push(
          bilingual(
            reason ||
              'سفارش شما توسط ادمین لغو شد. برای پیگیری با پشتیبانی تماس بگیرید.',
            reason ||
              'Your order was cancelled by the admin. Please contact support for follow-up.',
          ),
        );
        if (configName && configName !== 'renewal') lines.push(`📦 <b>${configName}</b>`);
        break;
      }
      case 'digital_code_ready': {
        const digitalCode =
          typeof payload.digitalCode === 'string' ? payload.digitalCode : null;
        lines.push(botT(loc, 'digital.ready'));
        if (serviceName || (configName && configName !== 'renewal')) {
          lines.push(
            botT(loc, 'digital.product', {
              name: this.escapeHtml(serviceName || configName || ''),
            }),
          );
        }
        if (digitalCode) {
          lines.push('', botT(loc, 'digital.code', { code: this.escapeHtml(digitalCode) }));
        }
        break;
      }
      case 'service_ready':
      case 'subscription_updated': {
        const isDigitalDelivery =
          payload.displayKind === 'digital_code' ||
          isDigitalInventoryProvider(
            typeof payload.providerId === 'string' ? payload.providerId : null,
          );
        if (isDigitalDelivery) {
          const digitalCode =
            typeof payload.digitalCode === 'string' ? payload.digitalCode : null;
          lines.push(botT(loc, 'digital.ready'));
          if (serviceName || (configName && configName !== 'renewal')) {
            lines.push(
              botT(loc, 'digital.product', {
                name: this.escapeHtml(serviceName || configName || ''),
              }),
            );
          }
          if (digitalCode) {
            lines.push('', botT(loc, 'digital.code', { code: this.escapeHtml(digitalCode) }));
          }
          break;
        }
        const isRenewal = !!payload.isRenewal || status === 'RENEWED';
        lines.push(
          bilingual(
            isRenewal ? '🎉 <b>تمدید انجام شد</b>' : '🎉 <b>سرویس شما آماده است</b>',
            isRenewal ? '🎉 <b>Renewal complete</b>' : '🎉 <b>Your service is ready</b>',
          ),
        );
        if (serviceName || (configName && configName !== 'renewal')) {
          lines.push(`📦 <b>${serviceName || configName}</b>`);
        }
        if (isEylanDelivery) {
          lines.push(
            bilingual(
              isRenewal
                ? 'تمدید انجام شد. لینک ساب زیر را باز کنید و فایل کانفیگ را دانلود کنید.'
                : 'خرید شما فعال شد.\n\nاین سرویس از نوع OpenVPN / WireGuard است — وارد لینک ساب شوید و فایل‌های کانفیگ مورد نظر را دانلود کنید (مثل اپ‌های V2Ray نیست).',
              isRenewal
                ? 'Renewal done. Open the subscription link below and download your config files.'
                : 'Your purchase is active.\n\nThis is an OpenVPN / WireGuard service — open the subscription link and download the config files you need (not a V2Ray app import).',
            ),
          );
        } else {
          lines.push(
            bilingual(
              isRenewal
                ? 'حجم و زمان پلن به سرویس قبلی اضافه شد.'
                : 'خرید شما فعال شد. از لینک ساب استفاده کنید.',
              isRenewal
                ? 'Plan volume and days were added to your existing service.'
                : 'Your purchase is active. Use the subscription link below.',
            ),
          );
        }
        // Show native URL whenever we have it (Eylan has no 3x-ui subId).
        if (resolvedSubUrl) {
          lines.push(
            ``,
            bilingual(
              '🔗 <b>لینک سابسکریپشن</b> (لمس برای کپی)',
              '🔗 <b>Subscription link</b> (tap to copy)',
            ),
            `<code>${resolvedSubUrl}</code>`,
          );
        }
        lines.push(
          ``,
          bilingual('🔑 توکن ورود وب (اختیاری):', '🔑 Web portal token (optional):'),
          `<code>${customer.token}</code>`,
        );
        break;
      }
      case 'provision_failed':
      case 'provisioning_issue': {
        lines.push(
          bilingual('⚠️ <b>ساخت سرویس ناموفق بود</b>', '⚠️ <b>Service creation failed</b>'),
        );
        lines.push(
          bilingual(
            'پرداخت تأیید شد ولی ساخت سرویس خطا داد. به‌زودی رفع و دوباره تلاش می‌شود.',
            'Payment was approved, but creating the service failed. We will fix it and retry.',
          ),
        );
        break;
      }
      case 'order_cancelled': {
        lines.push(bilingual('🚫 <b>سفارش لغو شد</b>', '🚫 <b>Order cancelled</b>'));
        if (input.message) lines.push(input.message);
        if (configName && configName !== 'renewal') lines.push(`📦 <b>${configName}</b>`);
        break;
      }
      case 'expiry_warning': {
        const svc = serviceName || 'سرویس';
        lines.push(
          bilingual('⏳ <b>سرویس رو به اتمام است</b>', '⏳ <b>Service expiring soon</b>'),
          '',
          bilingual(
            `سرویس «${svc}» کمتر از یک روز دیگر منقضی می‌شود.`,
            `Service "${svc}" expires in less than 1 day.`,
          ),
          bilingual(
            'برای تمدید سرویس روی دکمه <b>تمدید</b> بزنید.',
            'Tap <b>Renew</b> to extend this service.',
          ),
        );
        break;
      }
      case 'traffic_warning': {
        const svc = serviceName || 'سرویس';
        let leftLabel = '';
        if (remainingBytes != null) {
          if (remainingBytes <= 0) leftLabel = loc === 'en' ? '0' : '۰';
          else {
            const leftGb = remainingBytes / (1024 * 1024 * 1024);
            leftLabel =
              leftGb < 1
                ? `${Math.max(1, Math.round(leftGb * 1024))} MB`
                : `${leftGb.toFixed(1)} GB`;
          }
        }
        lines.push(
          bilingual('📊 <b>حجم سرویس رو به اتمام است</b>', '📊 <b>Traffic almost finished</b>'),
          '',
          remainingBytes != null && remainingBytes <= 0
            ? bilingual(
                `سرویس «${svc}» حجمش تمام شده است.`,
                `Service "${svc}" has no traffic left.`,
              )
            : bilingual(
                `سرویس «${svc}» در حال اتمام حجم است${leftLabel ? ` (باقی‌مانده: ${leftLabel})` : ''}.`,
                `Service "${svc}" is almost out of traffic${leftLabel ? ` (${leftLabel} left)` : ''}.`,
              ),
          bilingual(
            'برای تمدید سرویس روی دکمه <b>تمدید</b> بزنید.',
            'Tap <b>Renew</b> to extend this service.',
          ),
        );
        break;
      }
      default: {
        lines.push(`<b>${input.title}</b>`);
        if (input.message) lines.push(input.message);
        if (serviceName || configName) lines.push(`📦 ${serviceName || configName}`);
        break;
      }
    }

    if (trackingCode && kind !== 'test_created') {
      lines.push(``, this.orderNumberLine(trackingCode));
    }

    let text = lines.join('\n');
    const subUrl = resolvedSubUrl;
    const isReady =
      (kind === 'service_ready' || kind === 'subscription_updated') &&
      kind !== 'test_created';
    const needsSupport =
      kind === 'payment_rejected' ||
      kind === 'order_cancelled' ||
      kind === 'order_cancelled_by_admin' ||
      payload.includeSupport === true;
    const supportButtons = needsSupport
      ? await this.supportKeyboardButtons(customer.adminId)
      : [];

    let replyMarkup: Record<string, unknown> | undefined;
    if (kind === 'test_created') {
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: loc === 'en' ? '⬅️ Back' : '⬅️ بازگشت',
              callback_data: 'c:home',
            },
          ],
        ],
      };
    } else if (isReady) {
      replyMarkup = this.serviceReadyKeyboard(store, {
        subUrl,
        subId,
        serviceName: serviceName || configName,
        eylan: isEylanDelivery,
        locale: loc,
      });
    } else if (kind === 'order_submitted' || kind === 'renewal_submitted') {
      const rows: Array<Array<Record<string, unknown>>> = [];
      const trackUrl = trackingCode ? this.buildTrackUrl(store, trackingCode) : null;
      if (trackUrl) {
        rows.push([
          {
            text: loc === 'en' ? '🔎 Track order' : '🔎 پیگیری سفارش',
            url: trackUrl,
          },
        ]);
      }
      rows.push([
        {
          text: loc === 'en' ? '⬅️ Back' : '⬅️ بازگشت',
          callback_data: 'c:home',
        },
      ]);
      replyMarkup = { inline_keyboard: rows };
    } else if (
      kind === 'payment_rejected' ||
      kind === 'order_cancelled' ||
      kind === 'order_cancelled_by_admin'
    ) {
      // Match order-submitted layout: one support row + Back (no Mini App / web shop).
      const rows: Array<Array<Record<string, unknown>>> = [];
      const tgSupport = supportButtons.find(
        (b) => typeof b.text === 'string' && String(b.text).includes('تلگرام'),
      );
      if (tgSupport) {
        rows.push([tgSupport]);
      } else if (supportButtons[0]) {
        rows.push([supportButtons[0]]);
      }
      rows.push([
        {
          text: loc === 'en' ? '⬅️ Back' : '⬅️ بازگشت',
          callback_data: 'c:home',
        },
      ]);
      replyMarkup = { inline_keyboard: rows };
    } else if (kind === 'traffic_warning' || kind === 'expiry_warning') {
      const rows: Array<Array<Record<string, unknown>>> = [];
      if (clientId) {
        rows.push([
          {
            text: loc === 'en' ? '🔄 Renew' : '🔄 تمدید',
            callback_data: `c:rnw:${clientId}`,
          },
        ]);
      } else {
        rows.push([
          {
            text: loc === 'en' ? '🔄 Renew' : '🔄 تمدید',
            callback_data: 'c:renew',
          },
        ]);
      }
      rows.push([
        {
          text: loc === 'en' ? '⬅️ Back' : '⬅️ بازگشت',
          callback_data: 'c:home',
        },
      ]);
      replyMarkup = { inline_keyboard: rows };
    } else {
      replyMarkup = this.storeActionKeyboard(store, {
        supportButtons: supportButtons.length ? supportButtons : undefined,
      });
    }

    if (isReady && subUrl) {
      const qr = await this.buildQrDataUrl(subUrl);
      if (qr) {
        const caption = text.slice(0, 1024);
        return this.sendPhoto(botToken, customer.telegramUserId, qr, caption, {
          reply_markup: replyMarkup,
        });
      }
    }

    return this.sendMessage(botToken, customer.telegramUserId, text, {
      reply_markup: replyMarkup,
    });
  }

  private couponIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((x) => String(x || '').trim()).filter(Boolean);
  }

  private async patchCoupon(
    adminId: string,
    couponId: string,
    patch: Partial<{
      enabled: boolean;
      maxUses: number | null;
      code: string;
      description: string | null;
      discountType: string;
      discountValue: number;
      discountValueUsd: number;
      discountValueToman: number;
    }>,
  ) {
    const c = await this.prisma.storeCoupon.findFirst({
      where: { id: couponId, adminId },
    });
    if (!c) throw new Error('Coupon not found');
    return this.coupons.upsert(adminId, {
      id: c.id,
      code: patch.code ?? c.code,
      description:
        patch.description !== undefined
          ? patch.description || undefined
          : c.description || undefined,
      discountType: patch.discountType ?? c.discountType,
      discountValue: patch.discountValue ?? Number(c.discountValue),
      discountValueUsd: patch.discountValueUsd ?? Number(c.discountValueUsd || 0),
      discountValueToman: patch.discountValueToman ?? Number(c.discountValueToman || 0),
      maxUses: patch.maxUses !== undefined ? patch.maxUses : c.maxUses,
      enabled: patch.enabled !== undefined ? patch.enabled : c.enabled,
      audience: c.audience || 'all',
      checkoutKind: c.checkoutKind || 'both',
      productIds: this.couponIdList(c.productIds),
      categoryIds: this.couponIdList(c.categoryIds),
    });
  }

  private async handleAdminPromptInput(
    adminId: string,
    botToken: string,
    chatId: string | number,
    text: string,
  ): Promise<boolean> {
    const key = this.adminPromptKey(adminId, chatId);
    const draft = this.adminPromptDrafts.get(key);
    if (!draft) return false;

    if (text === '/cancel') {
      this.adminPromptDrafts.delete(key);
      await this.sendMessage(botToken, chatId, '❌ لغو شد.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
        },
      });
      return true;
    }

    const raw = text.trim();
    try {
      if (draft.kind === 'cust_name' && draft.targetId) {
        await this.prisma.storeCustomer.updateMany({
          where: { id: draft.targetId, adminId },
          data: { name: raw.slice(0, 120) || null },
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ نام به‌روز شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'cust_wa' && draft.targetId) {
        const cleared = raw === '-' || raw === '—' || raw.toLowerCase() === 'clear';
        await this.prisma.storeCustomer.updateMany({
          where: { id: draft.targetId, adminId },
          data: { whatsapp: cleared ? null : raw.slice(0, 40) },
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ شماره به‌روز شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'cust_tg' && draft.targetId) {
        const cleared = raw === '-' || raw === '—' || raw.toLowerCase() === 'clear';
        const username = cleared
          ? null
          : raw.replace(/^@/, '').replace(/\s+/g, '').slice(0, 64) || null;
        await this.prisma.storeCustomer.updateMany({
          where: { id: draft.targetId, adminId },
          data: {
            telegramUsername: username,
            telegram: username ? `@${username}` : null,
          },
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ یوزرنیم به‌روز شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'cust_note' && draft.targetId) {
        const cleared = raw === '-' || raw === '—' || raw.toLowerCase() === 'clear';
        await this.prisma.storeCustomer.updateMany({
          where: { id: draft.targetId, adminId },
          data: { notes: cleared ? null : raw.slice(0, 2000) },
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ یادداشت به‌روز شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'cust_msg' && draft.targetId) {
        const customer = await this.prisma.storeCustomer.findFirst({
          where: { id: draft.targetId, adminId },
          select: { telegramUserId: true, name: true },
        });
        if (!customer?.telegramUserId) {
          throw new Error('این مشتری آیدی تلگرام ندارد');
        }
        await this.sendMessage(
          botToken,
          customer.telegramUserId,
          `📩 <b>پیام فروشگاه</b>\n\n${this.escapeHtml(raw.slice(0, 3500))}`,
        );
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ پیام ارسال شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'wal_adjust' && draft.targetId) {
        let currency: string | undefined;
        let amountText = raw;
        if (/^t[:\s]/i.test(raw)) {
          currency = 'TOMAN';
          amountText = raw.replace(/^t[:\s]+/i, '');
        } else if (/^u[:\s]/i.test(raw) || /^\$/.test(raw)) {
          currency = 'USD';
          amountText = raw.replace(/^u[:\s]+/i, '').replace(/^\$/, '');
        }
        const amount = Number(String(amountText).replace(/,/g, '').trim());
        if (!Number.isFinite(amount) || amount === 0) {
          throw new Error('مبلغ نامعتبر است');
        }
        await this.wallet.adminAdjust(
          adminId,
          draft.targetId,
          amount,
          'Telegram admin adjust',
          currency,
        );
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ کیف‌پول تنظیم شد.');
        await this.sendAdminCustomerView(botToken, chatId, adminId, draft.targetId);
        return true;
      }

      if (draft.kind === 'prod_name' && draft.targetId) {
        await this.store.updateProduct(adminId, draft.targetId, { name: raw.slice(0, 120) });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ نام محصول به‌روز شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
      if (draft.kind === 'prod_price_toman' && draft.targetId) {
        const val = raw === '-' ? null : Number(String(raw).replace(/,/g, ''));
        if (raw !== '-' && !Number.isFinite(val as number)) throw new Error('عدد نامعتبر');
        await this.store.updateProduct(adminId, draft.targetId, { priceToman: val });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ قیمت تومان به‌روز شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
      if (draft.kind === 'prod_price_usd' && draft.targetId) {
        const val = Number(String(raw).replace(/,/g, ''));
        if (!Number.isFinite(val) || val < 0) throw new Error('عدد نامعتبر');
        await this.store.updateProduct(adminId, draft.targetId, { priceUsd: val });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ قیمت دلار به‌روز شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
      if (draft.kind === 'prod_days' && draft.targetId) {
        const val = Number(raw);
        if (!Number.isFinite(val) || val < 1) throw new Error('روز نامعتبر');
        await this.store.updateProduct(adminId, draft.targetId, { durationDays: val });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ مدت به‌روز شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
      if (draft.kind === 'prod_traffic' && draft.targetId) {
        const gb = Number(String(raw).replace(/,/g, ''));
        if (!Number.isFinite(gb) || gb < 0) throw new Error('گیگ نامعتبر');
        const traffic = gb === 0 ? 0 : Math.round(gb * 1024 ** 3);
        await this.store.updateProduct(adminId, draft.targetId, { traffic });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ ترافیک به‌روز شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
      if (draft.kind === 'prod_new_name') {
        if (raw.length < 2) throw new Error('نام کوتاه است');
        this.adminPromptDrafts.set(key, {
          adminId,
          kind: 'prod_new_name',
          meta: { name: raw.slice(0, 120) },
        });
        await this.sendAdminProductCategoryPicker(botToken, chatId, adminId);
        return true;
      }
      if (draft.kind === 'prod_new_prices') {
        const parts = raw.split(/[\s,]+/).filter(Boolean);
        if (parts.length < 4) throw new Error('چهار عدد بفرستید: تومان دلار روز گیگ');
        const toman = Number(parts[0].replace(/,/g, ''));
        const usd = Number(parts[1].replace(/,/g, ''));
        const days = Number(parts[2]);
        const gb = Number(parts[3]);
        if (![toman, usd, days, gb].every((n) => Number.isFinite(n))) throw new Error('اعداد نامعتبر');
        if (days < 1) throw new Error('روز نامعتبر');
        if (gb < 0) throw new Error('گیگ نامعتبر');
        if (usd < 0 || toman < 0) throw new Error('قیمت نامعتبر');
        const created = await this.store.createProduct(adminId, {
          name: draft.meta?.name,
          categoryId: draft.meta?.categoryId,
          profileId: draft.meta?.profileId,
          priceToman: toman > 0 ? toman : null,
          priceUsd: usd,
          durationDays: days,
          traffic: gb === 0 ? 0 : Math.round(gb * 1024 ** 3),
          visible: true,
          status: 'active',
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ محصول ساخته شد.');
        await this.sendAdminProductView(botToken, chatId, adminId, created.id);
        return true;
      }

      if (draft.kind === 'cpn_code') {
        const code = raw.toUpperCase().replace(/\s+/g, '');
        if (!code || code.length < 2) throw new Error('کد کوپن کوتاه است');
        this.adminPromptDrafts.set(key, {
          adminId,
          kind: 'cpn_value',
          meta: { code },
        });
        await this.sendMessage(
          botToken,
          chatId,
          [
            `کد: <code>${this.escapeHtml(code)}</code>`,
            ``,
            `مقدار تخفیف را بفرستید:`,
            `• درصد: <code>10</code> یا <code>10%</code>`,
            `• تومان ثابت: <code>t:50000</code>`,
            `• دلار ثابت: <code>u:5</code> یا <code>$5</code>`,
            ``,
            `برای لغو: /cancel`,
          ].join('\n'),
        );
        return true;
      }

      if (draft.kind === 'cpn_value') {
        const code = String(draft.meta?.code || '').trim();
        if (!code) throw new Error('کد کوپن نامعتبر');
        let discountType: 'percent' | 'fixed' = 'percent';
        let discountValue = 0;
        let discountValueUsd = 0;
        let discountValueToman = 0;
        if (/^t[:\s]/i.test(raw)) {
          discountType = 'fixed';
          discountValueToman = Number(raw.replace(/^t[:\s]+/i, '').replace(/,/g, ''));
        } else if (/^u[:\s]/i.test(raw) || /^\$/.test(raw)) {
          discountType = 'fixed';
          discountValueUsd = Number(
            raw.replace(/^u[:\s]+/i, '').replace(/^\$/, '').replace(/,/g, ''),
          );
        } else {
          discountType = 'percent';
          discountValue = Number(raw.replace(/%/g, '').replace(/,/g, '').trim());
        }
        if (discountType === 'percent' && !(discountValue > 0 && discountValue <= 100)) {
          throw new Error('درصد باید بین ۱ تا ۱۰۰ باشد');
        }
        if (
          discountType === 'fixed' &&
          !(discountValueUsd > 0 || discountValueToman > 0)
        ) {
          throw new Error('مبلغ ثابت نامعتبر است');
        }
        const created = await this.coupons.upsert(adminId, {
          code,
          discountType,
          discountValue: discountType === 'percent' ? discountValue : undefined,
          discountValueUsd: discountType === 'fixed' ? discountValueUsd : undefined,
          discountValueToman: discountType === 'fixed' ? discountValueToman : undefined,
          enabled: true,
          maxUses: null,
        });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ کوپن ساخته شد.');
        await this.sendAdminCouponView(botToken, chatId, adminId, created.id);
        return true;
      }

      if (draft.kind === 'cpn_max' && draft.targetId) {
        const cleared = raw === '-' || raw.toLowerCase() === 'unlimited';
        const maxUses = cleared ? null : Number(raw.replace(/,/g, ''));
        if (!cleared && (!Number.isFinite(maxUses!) || (maxUses as number) < 0)) {
          throw new Error('عدد نامعتبر');
        }
        await this.patchCoupon(adminId, draft.targetId, { maxUses: maxUses as number | null });
        this.adminPromptDrafts.delete(key);
        await this.sendMessage(botToken, chatId, '✅ سقف مصرف به‌روز شد.');
        await this.sendAdminCouponView(botToken, chatId, adminId, draft.targetId);
        return true;
      }
    } catch (err: any) {
      await this.sendMessage(
        botToken,
        chatId,
        `⚠️ ${this.escapeHtml(String(err?.message || err).slice(0, 200))}\nدوباره بفرستید یا /cancel`,
      );
      return true;
    }

    return false;
  }

  private broadcastDraftKey(adminId: string, chatId: string | number) {
    return `${adminId}:${chatId}`;
  }

  private audienceLabel(audience: BroadcastAudience) {
    if (audience === 'with_service') return 'دارای سرویس فعال';
    if (audience === 'without_service') return 'بدون سرویس فعال';
    return 'همه کاربران ربات';
  }

  async countBroadcastRecipients(adminId: string, audience: BroadcastAudience) {
    const recipients = await this.resolveBroadcastRecipients(adminId, audience);
    return recipients.length;
  }

  async getBroadcastPreview(adminId: string, audience: BroadcastAudience) {
    const recipients = await this.resolveBroadcastRecipients(adminId, audience);
    return {
      audience,
      total: recipients.length,
      withTelegram: recipients.length,
    };
  }

  private async resolveBroadcastRecipients(adminId: string, audience: BroadcastAudience) {
    const customers = await this.prisma.storeCustomer.findMany({
      where: { adminId, status: 'active' },
      select: {
        id: true,
        telegramUserId: true,
        orders: {
          where: {
            status: { in: ['ACTIVE', 'RENEWED'] },
            clientId: { not: null },
          },
          select: {
            status: true,
            clientId: true,
            client: { select: { enable: true, expiryTime: true } },
          },
        },
      },
    });
    return filterBroadcastRecipients(customers, audience).map((c) => ({
      id: c.id,
      telegramUserId: String(c.telegramUserId),
    }));
  }

  private formatBroadcastCaption(text: string) {
    return this.escapeHtml(String(text || '').trim());
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendPhotoByFileId(
    botToken: string,
    chatId: string | number,
    fileId: string,
    caption: string,
    extra?: Record<string, unknown>,
  ) {
    try {
      await this.telegramHttp.postTelegramJson(
        botToken,
        'sendPhoto',
        {
          chat_id: chatId,
          photo: fileId,
          caption: caption.slice(0, 1024),
          parse_mode: 'HTML',
          ...(extra || {}),
        },
        30_000,
      );
      return true;
    } catch (err: any) {
      const detail = err?.message || String(err);
      this.logger.warn(`Telegram sendPhoto (file_id) failed: ${detail}`);
      return false;
    }
  }

  async executeBroadcast(
    adminId: string,
    botToken: string,
    input: {
      audience: BroadcastAudience;
      text: string;
      photoDataUrl?: string | null;
      photoFileId?: string | null;
    },
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: { telegramBotEnabled: true, telegramBotTokenEnc: true },
    });
    if (!store?.telegramBotEnabled) {
      throw new BadRequestException('Telegram bot is disabled');
    }
    const token = botToken || this.decryptToken(store.telegramBotTokenEnc);
    if (!token) throw new BadRequestException('Telegram bot token missing');

    const caption = this.formatBroadcastCaption(input.text);
    if (!caption && !input.photoDataUrl && !input.photoFileId) {
      throw new BadRequestException('Message text is required');
    }

    const recipients = await this.resolveBroadcastRecipients(adminId, input.audience);
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      let ok = false;
      if (input.photoDataUrl) {
        ok = await this.sendPhoto(token, recipient.telegramUserId, input.photoDataUrl, caption);
      } else if (input.photoFileId) {
        ok = await this.sendPhotoByFileId(
          token,
          recipient.telegramUserId,
          input.photoFileId,
          caption,
        );
      } else {
        ok = await this.sendMessage(token, recipient.telegramUserId, caption);
      }
      if (ok && ((ok as any).ok === true || ok === true)) sent += 1;
      else failed += 1;
      await this.sleep(40);
    }

    return { total: recipients.length, sent, failed, audience: input.audience };
  }

  async broadcastFromPanel(
    adminId: string,
    body: {
      text: string;
      audience?: BroadcastAudience;
      photoDataUrl?: string | null;
    },
  ) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId },
      select: { telegramBotEnabled: true, telegramBotTokenEnc: true },
    });
    if (!store?.telegramBotEnabled) {
      throw new BadRequestException('Telegram bot is disabled');
    }
    const botToken = this.decryptToken(store.telegramBotTokenEnc);
    if (!botToken) throw new BadRequestException('Telegram bot token missing');

    const audience = (body.audience || 'all') as BroadcastAudience;
    if (!['all', 'with_service', 'without_service'].includes(audience)) {
      throw new BadRequestException('Invalid audience');
    }

    return this.executeBroadcast(adminId, botToken, {
      audience,
      text: body.text,
      photoDataUrl: body.photoDataUrl,
    });
  }

  private async sendBroadcastAudiencePicker(
    botToken: string,
    chatId: string | number,
    adminId: string,
    messageId?: number,
  ) {
    const [allCount, withCount, withoutCount] = await Promise.all([
      this.countBroadcastRecipients(adminId, 'all'),
      this.countBroadcastRecipients(adminId, 'with_service'),
      this.countBroadcastRecipients(adminId, 'without_service'),
    ]);
    const text = [
      '📢 <b>ارسال پیام همگانی</b>',
      ``,
      `مخاطب را انتخاب کنید:`,
      `• همه: ${allCount} نفر`,
      `• دارای سرویس: ${withCount} نفر`,
      `• بدون سرویس: ${withoutCount} نفر`,
    ].join('\n');
    await this.replyOrEdit(
      botToken,
      chatId,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `👥 همه (${allCount})`, callback_data: 'broadcast:aud:all' }],
            [
              {
                text: `✅ دارای سرویس (${withCount})`,
                callback_data: 'broadcast:aud:with_service',
              },
            ],
            [
              {
                text: `🆕 بدون سرویس (${withoutCount})`,
                callback_data: 'broadcast:aud:without_service',
              },
            ],
            [{ text: '🏠 بازگشت', callback_data: 'admin:home' }],
          ],
        },
      },
      messageId,
    );
  }

  private async handleAdminBroadcastInput(
    adminId: string,
    botToken: string,
    chatId: string | number,
    message: any,
    text: string,
  ): Promise<boolean> {
    const key = this.broadcastDraftKey(adminId, chatId);
    const draft = this.broadcastDrafts.get(key);
    if (!draft) return false;

    if (text === '/cancel') {
      this.broadcastDrafts.delete(key);
      await this.sendMessage(botToken, chatId, '❌ ارسال همگانی لغو شد.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 منوی ادمین', callback_data: 'admin:home' }]],
        },
      });
      return true;
    }

    const photos = Array.isArray(message?.photo) ? message.photo : [];
    const largestPhoto = photos.length ? photos[photos.length - 1] : null;
    const caption = String(message?.caption || text || '').trim();

    if (!caption && !largestPhoto) {
      await this.sendMessage(
        botToken,
        chatId,
        '⚠️ متن یا عکس با کپشن ارسال کنید. برای لغو: /cancel',
      );
      return true;
    }

    draft.text = caption;
    if (largestPhoto?.file_id) draft.photoFileId = String(largestPhoto.file_id);
    this.broadcastDrafts.set(key, draft);

    const count = await this.countBroadcastRecipients(adminId, draft.audience);
    const preview = this.formatBroadcastCaption(draft.text).slice(0, 500);
    const lines = [
      '📝 <b>پیش‌نمایش پیام</b>',
      ``,
      `مخاطب: <b>${this.audienceLabel(draft.audience)}</b> (${count} نفر)`,
      draft.photoFileId ? '🖼 همراه با عکس' : '',
      ``,
      preview || '(بدون متن)',
    ].filter(Boolean);

    await this.sendMessage(botToken, chatId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ ارسال', callback_data: 'broadcast:confirm' },
            { text: '❌ لغو', callback_data: 'broadcast:cancel' },
          ],
        ],
      },
    });
    return true;
  }
}
