import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import axios from 'axios';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { StoreCustomerAuthService } from './store-customer-auth.service';
import { StoreRateLimitService } from './store-rate-limit.service';
import { generateCustomerToken } from './store.types';
import { StoreService } from './store.service';
import { formatDateTimeInTz } from '../../common/utils/timezone';

type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

@Injectable()
export class StoreTelegramService {
  private readonly logger = new Logger(StoreTelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly customerAuth: StoreCustomerAuthService,
    private readonly rateLimit: StoreRateLimitService,
    @Inject(forwardRef(() => StoreService))
    private readonly store: StoreService,
  ) {}

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

  private storeActionKeyboard(
    store: {
      slug: string;
      domain?: { domain: string; status: string } | null;
    },
    opts?: { openLabel?: string },
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
    return rows.length ? { inline_keyboard: rows } : undefined;
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
    opts: { subUrl?: string | null; subId?: string | null; serviceName?: string | null },
  ) {
    const rows: Array<Array<Record<string, unknown>>> = [];
    if (opts.subUrl) {
      const apps = this.appImportLinks(opts.subUrl, opts.serviceName || 'VPN');
      rows.push([
        { text: '📱 V2Box', url: this.httpsAppBridge(store, apps.v2box) },
        { text: '⚡ Streisand', url: this.httpsAppBridge(store, apps.streisand) },
      ]);
      rows.push([{ text: '✨ Happ', url: this.httpsAppBridge(store, apps.happ) }]);
    }
    const portalUrl = opts.subId ? this.buildSubPortalUrl(store, opts.subId) : null;
    if (portalUrl) {
      rows.push([
        {
          text: '📊 حجم و زمان باقیمانده',
          web_app: { url: portalUrl },
        },
      ]);
    }
    const miniAppUrl = this.buildMiniAppUrl(store);
    if (miniAppUrl) {
      rows.push([{ text: '🚀 فروشگاه', web_app: { url: miniAppUrl } }]);
    }
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
    return {
      enabled: store.telegramBotEnabled,
      botTokenMasked: this.maskToken(plain),
      hasToken: !!plain,
      botUsername: store.telegramBotUsername,
      welcomeText: store.telegramWelcomeText?.trim() || this.defaultWelcomeText(store.title),
      webhookConfigured: !!store.telegramWebhookSecret,
      adminChatId: store.telegramAdminChatId || null,
      miniAppUrl: this.buildMiniAppUrl(store),
      shopUrl: this.buildShopUrl(store),
    };
  }

  async updateTelegramSettings(
    adminId: string,
    input: {
      enabled?: boolean;
      botToken?: string;
      welcomeText?: string | null;
      adminChatId?: string | null;
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
          const me = await axios.get(`https://api.telegram.org/bot${trimmed}/getMe`, {
            timeout: 10000,
          });
          username = me.data?.result?.username || username;
        } catch {
          throw new BadRequestException('Invalid Telegram bot token');
        }
      }
    }

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
      },
      include: { domain: { select: { domain: true, status: true } } },
    });

    const plain = this.decryptToken(updated.telegramBotTokenEnc);
    return {
      enabled: updated.telegramBotEnabled,
      botTokenMasked: this.maskToken(plain),
      hasToken: !!plain,
      botUsername: updated.telegramBotUsername,
      welcomeText:
        updated.telegramWelcomeText?.trim() || this.defaultWelcomeText(updated.title),
      webhookConfigured: !!updated.telegramWebhookSecret,
      adminChatId: updated.telegramAdminChatId || null,
      miniAppUrl: this.buildMiniAppUrl(updated),
      shopUrl: this.buildShopUrl(updated),
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

    await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      { url: webhookUrl, allowed_updates: ['message', 'callback_query'] },
      { timeout: 15000 },
    );

    const miniAppUrl = this.buildMiniAppUrl(store);
    if (miniAppUrl) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${token}/setChatMenuButton`,
          {
            menu_button: {
              type: 'web_app',
              text: 'Open',
              web_app: { url: miniAppUrl },
            },
          },
          { timeout: 15000 },
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
  ) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(extra || {}),
        },
        { timeout: 15000 },
      );
      return true;
    } catch (err: any) {
      const detail =
        err?.response?.data?.description || err?.message || String(err);
      this.logger.warn(`Telegram sendMessage failed: ${detail}`);
      // Retry plain text if HTML parse failed
      if (String(detail).toLowerCase().includes('parse')) {
        try {
          await axios.post(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              chat_id: chatId,
              text: text.replace(/<[^>]+>/g, ''),
              disable_web_page_preview: true,
              ...(extra || {}),
            },
            { timeout: 15000 },
          );
          return true;
        } catch (err2: any) {
          this.logger.warn(
            `Telegram sendMessage plain retry failed: ${err2?.response?.data?.description || err2?.message}`,
          );
        }
      }
      return false;
    }
  }

  async sendPhoto(
    botToken: string,
    chatId: string | number,
    imageDataUrl: string,
    caption: string,
    extra?: Record<string, unknown>,
  ) {
    try {
      const parsed = this.parseDataUrl(imageDataUrl);
      if (!parsed) {
        return this.sendMessage(botToken, chatId, caption, extra);
      }
      // Node FormData + Blob — never set Content-Type manually (breaks boundary)
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');
      form.append(
        'photo',
        new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mime }),
        parsed.mime.includes('png') ? 'receipt.png' : 'receipt.jpg',
      );
      if (extra?.reply_markup) {
        form.append('reply_markup', JSON.stringify(extra.reply_markup));
      }
      await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, form, {
        timeout: 30000,
      });
      return true;
    } catch (err: any) {
      const detail =
        err?.response?.data?.description || err?.message || String(err);
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
    return axios
      .post(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        { callback_query_id: callbackQueryId, text: text || undefined, show_alert: !!text },
        { timeout: 10000 },
      )
      .catch(() => null);
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

    const customer = await this.prisma.storeCustomer.create({
      data: {
        adminId,
        token,
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
    if (customer.status !== 'active') throw new UnauthorizedException('Customer disabled');

    if (created && customer.telegramUserId) {
      void this.sendPortalAccessMessage(botToken, customer.telegramUserId, store, customer.token);
    }

    const session = await this.customerAuth.createSession(customer.id, context);
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

    const callback = update?.callback_query;
    if (callback?.id && callback?.data) {
      await this.handleAdminCallback(store.adminId, botToken, callback);
      return { ok: true };
    }

    const message = update?.message;
    const text = String(message?.text || '').trim();
    const chatId = message?.chat?.id;
    const from = message?.from as TelegramWebAppUser | undefined;
    if (!chatId || !from?.id) return { ok: true };

    if (text.startsWith('/admin') || text.startsWith('/setadmin')) {
      await this.prisma.storeProfile.update({
        where: { id: store.id },
        data: { telegramAdminChatId: String(chatId) },
      });
      await this.sendMessage(
        botToken,
        chatId,
        '✅ این چت به‌عنوان ادمین سفارش‌ها ذخیره شد.\nاز این پس سفارش‌های جدید با دکمه تأیید/رد اینجا می‌آیند.',
      );
      return { ok: true };
    }

    if (text.startsWith('/start')) {
      const { customer } = await this.findOrCreateByTelegram(store.adminId, from);
      const welcome =
        store.telegramWelcomeText?.trim() || this.defaultWelcomeText(store.title);

      // If this chat is the store admin, also list pending orders for review
      if (this.isAdminActor(store.telegramAdminChatId, String(from.id), chatId)) {
        const pending = await this.prisma.storeOrder.findMany({
          where: {
            storeId: store.id,
            status: { in: ['UNDER_REVIEW', 'PAYMENT_SUBMITTED', 'PENDING_PAYMENT'] },
          },
          include: {
            product: { select: { name: true } },
            payment: { select: { receiptText: true, receiptImage: true, amount: true, currency: true } },
            customer: { select: { name: true, telegramUsername: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        });
        if (pending.length) {
          await this.sendMessage(
            botToken,
            chatId,
            `👋 ادمین عزیز\n\n📋 <b>${pending.length}</b> سفارش در صف بررسی:\nاز دکمه‌های زیر هر سفارش تأیید/رد کنید.`,
          );
          for (const o of pending) {
            await this.notifyAdminNewOrder(store.adminId, o.id);
          }
          return { ok: true };
        }
        await this.sendMessage(
          botToken,
          chatId,
          `👋 ادمین فروشگاه\n\nفعلاً سفارش معلقی نیست.\nسفارش‌های جدید اینجا با دکمه تأیید/رد می‌آیند.\n\nبرای تنظیم مجدد ادمین: /admin`,
        );
        return { ok: true };
      }

      const activeOrders = await this.prisma.storeOrder.findMany({
        where: {
          customerId: customer.id,
          status: { in: ['ACTIVE', 'RENEWED'] },
          clientId: { not: null },
        },
        include: {
          client: {
            select: {
              remark: true,
              email: true,
              subId: true,
              enable: true,
              expiryTime: true,
              total: true,
              up: true,
              down: true,
            },
          },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      let servicesBlock = '';
      if (activeOrders.length) {
        const tz = String(
          (await this.settings.getSetting('display_timezone', 'Asia/Tehran')) || 'Asia/Tehran',
        );
        servicesBlock =
          '\n\n📦 <b>سرویس‌های فعال شما</b>\n' +
          (
            await Promise.all(
              activeOrders.map((o) =>
                this.formatConfigBlock(store, o.client, o.trackingCode, tz),
              ),
            )
          ).join('\n\n');
      }

      await this.sendMessage(botToken, chatId, `${welcome}${servicesBlock}`, {
        reply_markup: this.storeActionKeyboard(store, { openLabel: '🚀 Open' }),
      });

      // Portal token only in bot chat (optional web login) — Mini App never needs it
      await this.sendPortalAccessMessage(botToken, chatId, store, customer.token);
    }

    return { ok: true };
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
      select: { telegramAdminChatId: true },
    });

    if (!this.isAdminActor(store?.telegramAdminChatId, fromId, chatId)) {
      await this.answerCallback(botToken, callbackId, '⛔ فقط ادمین فروشگاه');
      return;
    }

    const approveMatch = /^approve:(.+)$/.exec(data);
    const rejectMatch = /^reject:(.+)$/.exec(data);

    try {
      if (approveMatch) {
        const orderId = approveMatch[1];
        await this.store.approveOrder(adminId, 'ADMIN', orderId);
        await this.answerCallback(botToken, callbackId, '✅ سفارش تأیید شد');
        await this.clearInlineKeyboard(botToken, chatId, messageId);
        if (chatId) {
          await this.sendMessage(
            botToken,
            chatId,
            `✅ سفارش تأیید و در صف ساخت سرویس قرار گرفت.\n<code>${orderId}</code>`,
          );
        }
        return;
      }
      if (rejectMatch) {
        const orderId = rejectMatch[1];
        await this.store.rejectOrder(adminId, orderId, 'Rejected via Telegram');
        await this.answerCallback(botToken, callbackId, '❌ سفارش رد شد');
        await this.clearInlineKeyboard(botToken, chatId, messageId);
        if (chatId) {
          await this.sendMessage(
            botToken,
            chatId,
            `❌ سفارش رد شد.\n<code>${orderId}</code>`,
          );
        }
        return;
      }
      await this.answerCallback(botToken, callbackId);
    } catch (err: any) {
      const msg = String(err?.message || err || 'Action failed').slice(0, 180);
      await this.answerCallback(botToken, callbackId, msg);
      if (chatId) await this.sendMessage(botToken, chatId, `⚠️ ${msg}`);
    }
  }

  private async clearInlineKeyboard(
    botToken: string,
    chatId?: string | number,
    messageId?: number,
  ) {
    if (!chatId || !messageId) return;
    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`,
        { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } },
        { timeout: 10000 },
      );
    } catch {
      /* ignore */
    }
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
        `notifyAdminNewOrder: no telegramAdminChatId — admin must /admin in the bot`,
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
        product: { select: { name: true } },
        customer: { select: { name: true, telegram: true, telegramUsername: true } },
        payment: {
          select: { receiptText: true, receiptImage: true, amount: true, currency: true },
        },
      },
    });
    if (!order) return false;

    const hasReceipt = !!(order.payment?.receiptText || order.payment?.receiptImage);
    const kind = order.isRenewal ? '🔄 تمدید' : '🛒 خرید جدید';
    const customerLabel = this.escapeHtml(
      order.customer?.name ||
        (order.customer?.telegramUsername
          ? `@${order.customer.telegramUsername}`
          : order.customer?.telegram) ||
        'Customer',
    );
    const amount = Number(order.payment?.amount ?? order.amount ?? 0);
    const currency = (order.payment?.currency || order.currency || '').toUpperCase();
    const amountLabel =
      currency.includes('TOMAN') || currency === 'IRT' || currency === 'IRR'
        ? `${amount.toLocaleString()} تومان`
        : `$${amount}`;
    const productName = this.escapeHtml(order.product?.name || '—');
    const configName = this.escapeHtml(order.configName || '—');
    const tracking = this.escapeHtml(order.trackingCode);

    const lines = [
      hasReceipt
        ? `🛎️ <b>سفارش جدید — نیاز به بررسی</b>`
        : `🛎️ <b>سفارش جدید — بدون رسید</b>`,
      ``,
      `${kind}`,
      `📦 محصول: <b>${productName}</b>`,
      `🏷 کانفیگ: <code>${configName}</code>`,
      `👤 مشتری: ${customerLabel}`,
      `💰 مبلغ: <b>${amountLabel}</b>`,
      `🧾 Tracking: <code>${tracking}</code>`,
      `📊 وضعیت: ${this.escapeHtml(order.status.replace(/_/g, ' '))}`,
    ];
    if (order.payment?.receiptText) {
      lines.push(
        ``,
        `📝 یادداشت پرداخت:`,
        this.escapeHtml(order.payment.receiptText).slice(0, 800),
      );
    } else if (!hasReceipt) {
      lines.push(``, `⚠️ مشتری هنوز رسید نفرستاده.`);
    }

    const keyboard = hasReceipt
      ? {
          inline_keyboard: [
            [
              { text: '✅ تأیید و فعال‌سازی', callback_data: `approve:${order.id}` },
              { text: '❌ رد', callback_data: `reject:${order.id}` },
            ],
          ],
        }
      : {
          inline_keyboard: [
            [{ text: '❌ رد سفارش', callback_data: `reject:${order.id}` }],
          ],
        };

    const caption = lines.join('\n');
    if (order.payment?.receiptImage) {
      return this.sendPhoto(
        botToken,
        store.telegramAdminChatId,
        order.payment.receiptImage,
        caption,
        { reply_markup: keyboard },
      );
    }
    return this.sendMessage(botToken, store.telegramAdminChatId, caption, {
      reply_markup: keyboard,
    });
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
    if (trackingCode) lines.push(`  🧾 Tracking: <code>${trackingCode}</code>`);
    if (client?.subId) {
      const sub = this.buildSubUrl(store, client.subId);
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
    const status = typeof payload.status === 'string' ? payload.status : null;
    const configName =
      typeof payload.configName === 'string' ? payload.configName : null;
    const serviceName =
      typeof payload.serviceName === 'string' ? payload.serviceName : null;
    const reason = typeof payload.reason === 'string' ? payload.reason : null;
    const kind =
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

    const bilingual = (fa: string, en: string) => `${fa}\n${en}`;
    const lines: string[] = [];

    switch (kind) {
      case 'order_submitted':
      case 'renewal_submitted': {
        const isRenewal = !!payload.isRenewal || kind === 'renewal_submitted';
        lines.push(
          isRenewal
            ? bilingual('🔄 <b>درخواست تمدید ثبت شد</b>', '<b>Renewal submitted</b>')
            : bilingual('🛒 <b>سفارش ثبت شد</b>', '<b>Order submitted</b>'),
        );
        if (serviceName || configName) {
          lines.push(`📦 ${serviceName || configName}`);
        }
        lines.push(
          bilingual(
            status === 'UNDER_REVIEW' || status === 'PAYMENT_SUBMITTED'
              ? 'رسید دریافت شد — در انتظار بررسی ادمین.'
              : 'سفارش ساخته شد — منتظر جزئیات پرداخت.',
            status === 'UNDER_REVIEW' || status === 'PAYMENT_SUBMITTED'
              ? 'Receipt received — awaiting admin review.'
              : 'Order created — waiting for payment details.',
          ),
        );
        break;
      }
      case 'payment_approved':
      case 'order_approved': {
        lines.push(bilingual('✅ <b>سفارش تأیید شد</b>', '<b>Order approved</b>'));
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
        lines.push(bilingual('❌ <b>سفارش رد شد</b>', '<b>Order rejected</b>'));
        lines.push(
          bilingual(
            reason || 'پرداخت رد شد. با پشتیبانی تماس بگیرید یا با رسید جدید تلاش کنید.',
            reason ||
              'Your payment was rejected. Contact support or retry with a new receipt.',
          ),
        );
        if (configName) lines.push(`🏷 <code>${configName}</code>`);
        break;
      }
      case 'service_ready':
      case 'subscription_updated': {
        const isRenewal = !!payload.isRenewal || status === 'RENEWED';
        lines.push(
          isRenewal
            ? bilingual('🎉 <b>تمدید انجام شد</b>', '<b>Renewal complete</b>')
            : bilingual('🎉 <b>سرویس شما آماده است</b>', '<b>Your service is ready</b>'),
        );
        if (serviceName || configName) {
          lines.push(`📦 <b>${serviceName || configName}</b>`);
        }
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
        if (subId) {
          const subUrl = this.buildSubUrl(store, subId);
          if (subUrl) {
            lines.push(
              ``,
              bilingual('🔗 <b>لینک سابسکریپشن</b> (لمس برای کپی)', '<b>Subscription link</b> (tap to copy)'),
              `<code>${subUrl}</code>`,
            );
          }
        }
        lines.push(
          ``,
          bilingual('🔑 توکن ورود وب (اختیاری):', 'Web portal token (optional):'),
          `<code>${customer.token}</code>`,
        );
        break;
      }
      case 'provision_failed':
      case 'provisioning_issue': {
        lines.push(
          bilingual('⚠️ <b>ساخت سرویس ناموفق بود</b>', '<b>Service creation failed</b>'),
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
        lines.push(bilingual('🚫 <b>سفارش لغو شد</b>', '<b>Order cancelled</b>'));
        if (input.message) lines.push(input.message);
        break;
      }
      case 'expiry_warning': {
        lines.push(
          bilingual('⏳ <b>سرویس رو به اتمام است</b>', '<b>Service expiring soon</b>'),
        );
        if (serviceName) lines.push(`📦 <b>${serviceName}</b>`);
        if (input.message) lines.push(input.message);
        lines.push(
          bilingual('همین حالا تمدید کنید.', 'Renew now to avoid interruption.'),
        );
        break;
      }
      case 'traffic_warning': {
        lines.push(
          bilingual('📊 <b>حجم سرویس رو به اتمام است</b>', '<b>Traffic almost finished</b>'),
        );
        if (serviceName) lines.push(`📦 <b>${serviceName}</b>`);
        if (input.message) lines.push(input.message);
        lines.push(bilingual('تمدید یا ارتقا را بررسی کنید.', 'Consider renewing or upgrading.'));
        break;
      }
      default: {
        // Important fallback: keep FA/EN if title already bilingual, else show as-is
        lines.push(`<b>${input.title}</b>`);
        if (input.message) lines.push(input.message);
        if (serviceName || configName) lines.push(`📦 ${serviceName || configName}`);
        break;
      }
    }

    if (trackingCode) {
      lines.push(`🧾 Tracking: <code>${trackingCode}</code>`);
      const trackUrl = this.buildTrackUrl(store, trackingCode);
      if (trackUrl && kind !== 'service_ready' && kind !== 'subscription_updated') {
        lines.push(trackUrl);
      }
    }

    const text = lines.join('\n');
    const subUrl = subId ? this.buildSubUrl(store, subId) : null;
    const isReady = kind === 'service_ready' || kind === 'subscription_updated';
    const replyMarkup = isReady
      ? this.serviceReadyKeyboard(store, {
          subUrl,
          subId,
          serviceName: serviceName || configName,
        })
      : this.storeActionKeyboard(store);

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
}
