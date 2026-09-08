/**
 * Built-in storefront packs. Branding (logo, name, colors, support links)
 * always comes from Branding / store profile — packs change structure + chrome.
 * Generic `copy` is optional marketing microcopy (no shop names).
 */
export type StorefrontSkinId = 'default' | 'atelier' | 'pulse' | 'lumen' | 'cascade';
export type StorefrontLayoutId = 'classic' | 'market' | 'split' | 'funnel';

export type StorefrontBilingual = { en?: string; fa?: string };

export type StorefrontSkinSettings = {
  skin?: StorefrontSkinId | string;
  layout?: StorefrontLayoutId | string;
  version?: number;
  customCss?: string;
  cssVars?: Record<string, string>;
  preview?: { accent?: string; bg?: string; label?: string };
  copy?: Record<string, unknown>;
};

export const STARTER_KEY_ALIASES: Record<string, string> = {
  noir: 'pulse',
  harbor: 'lumen',
};

export const STARTER_SLUG_ALIASES: Record<string, string> = {
  'starter-noir': 'starter-pulse',
  'starter-harbor': 'starter-lumen',
};

const pulseCopy = {
  kicker: { en: 'Catalog', fa: 'کاتالوگ' },
  headline: { en: 'Place your order', fa: 'سفارش خود را ثبت کنید' },
  subhead: {
    en: 'Pick a plan, confirm the details, and check out in a few steps.',
    fa: 'پلن را انتخاب کنید، جزئیات را تأیید کنید و در چند مرحله پرداخت کنید.',
  },
  ctaPrimary: { en: 'Continue', fa: 'ادامه' },
  ctaSecondary: { en: 'Sign in', fa: 'ورود' },
  ctaTrack: { en: 'Track an order', fa: 'پیگیری سفارش' },
  availableLabel: { en: 'Ready to order', fa: 'آماده سفارش' },
  availableHint: { en: 'Plans update as you select them', fa: 'با انتخاب پلن، جزئیات به‌روز می‌شود' },
  tabPlans: { en: 'Plans', fa: 'پلن‌ها' },
  tabDetails: { en: 'Details', fa: 'جزئیات' },
  tabPay: { en: 'Pay', fa: 'پرداخت' },
  orderValue: { en: 'Order summary', fa: 'خلاصه سفارش' },
  footerNote: {
    en: 'Secure checkout. Support is one tap away.',
    fa: 'پرداخت امن. پشتیبانی همیشه در دسترس است.',
  },
  features: [
    { title: { en: 'Live catalog', fa: 'کاتالوگ زنده' }, body: { en: 'See every available plan in one board.', fa: 'همه پلن‌های فعال در یک صفحه.' } },
    { title: { en: 'Fast checkout', fa: 'تسویه سریع' }, body: { en: 'Confirm details and submit in seconds.', fa: 'جزئیات را تأیید کنید و سریع ثبت کنید.' } },
    { title: { en: 'Clear fees', fa: 'هزینه شفاف' }, body: { en: 'Price, traffic, and duration stay visible.', fa: 'قیمت، ترافیک و مدت همیشه مشخص است.' } },
  ],
};

const lumenCopy = {
  kicker: { en: 'Get started', fa: 'شروع کنید' },
  headline: { en: 'We’d love to help you get started', fa: 'خوشحال می‌شویم کمکتان کنیم شروع کنید' },
  subhead: {
    en: 'Choose what you need, then continue to the catalog. Support and store details stay on the side.',
    fa: 'آنچه لازم دارید را انتخاب کنید و به کاتالوگ بروید. پشتیبانی و مشخصات فروشگاه در کنار صفحه می‌ماند.',
  },
  ctaPrimary: { en: 'Continue', fa: 'ادامه' },
  ctaSecondary: { en: 'Sign in', fa: 'ورود' },
  ctaTrack: { en: 'Track an order', fa: 'پیگیری سفارش' },
  chatLabel: { en: 'Chat with us', fa: 'گفتگو با ما' },
  officeLabel: { en: 'Website', fa: 'وب‌سایت' },
  phoneLabel: { en: 'Direct contact', fa: 'تماس مستقیم' },
  footerNote: {
    en: 'Simple catalog. Clear prices. Help whenever you need it.',
    fa: 'کاتالوگ ساده. قیمت شفاف. پشتیبانی هر زمان لازم بود.',
  },
  features: [
    { title: { en: 'Browse plans', fa: 'مرور پلن‌ها' }, body: { en: 'A clean list of everything currently offered.', fa: 'فهرست مرتب همه پیشنهادهای فعلی.' } },
    { title: { en: 'Guided checkout', fa: 'خرید راهنمایی‌شده' }, body: { en: 'One path from category to payment.', fa: 'یک مسیر از دسته تا پرداخت.' } },
    { title: { en: 'Account portal', fa: 'پورتال مشتری' }, body: { en: 'Renew, track, and manage services later.', fa: 'تمدید، پیگیری و مدیریت سرویس‌ها بعداً.' } },
    { title: { en: 'Transparent limits', fa: 'محدودیت شفاف' }, body: { en: 'Traffic and duration are shown up front.', fa: 'ترافیک و مدت از ابتدا مشخص است.' } },
    { title: { en: 'Priority help', fa: 'پشتیبانی سریع' }, body: { en: 'Reach the store through the channels they enabled.', fa: 'از کانال‌هایی که فروشگاه فعال کرده تماس بگیرید.' } },
    { title: { en: 'Mobile ready', fa: 'آماده موبایل' }, body: { en: 'The same layout works in the browser and Mini App.', fa: 'همین چیدمان در مرورگر و مینی‌اپ کار می‌کند.' } },
  ],
};

const cascadeCopy = {
  kicker: { en: 'Checkout', fa: 'تسویه' },
  headline: { en: 'Complete your order in a few calm steps', fa: 'سفارش را در چند مرحله آرام تمام کنید' },
  subhead: {
    en: 'Follow the stepper, fill in only what is needed, and submit when you are ready.',
    fa: 'Stepper را دنبال کنید، فقط فیلدهای لازم را پر کنید و وقتی آماده بودید ثبت کنید.',
  },
  ctaPrimary: { en: 'Next', fa: 'بعدی' },
  ctaSecondary: { en: 'Previous', fa: 'قبلی' },
  ctaTrack: { en: 'Track an order', fa: 'پیگیری سفارش' },
  timeLabel: { en: 'Typical review', fa: 'زمان بررسی معمول' },
  timeValue: { en: 'A few minutes', fa: 'چند دقیقه' },
  statusDone: { en: 'Completed', fa: 'انجام شد' },
  statusNow: { en: 'In progress', fa: 'در حال انجام' },
  statusNext: { en: 'Pending', fa: 'در انتظار' },
  footerNote: {
    en: 'Your details stay on this store. You can go back a step at any time.',
    fa: 'اطلاعات فقط در همین فروشگاه می‌ماند. هر زمان می‌توانید یک مرحله برگردید.',
  },
  features: [
    { title: { en: 'Catalog', fa: 'کاتالوگ' }, body: { en: 'Choose a category and a plan.', fa: 'دسته و پلن را انتخاب کنید.' } },
    { title: { en: 'Details', fa: 'جزئیات' }, body: { en: 'Add-ons and a config name if needed.', fa: 'افزونه و نام کانفیگ در صورت نیاز.' } },
    { title: { en: 'Payment', fa: 'پرداخت' }, body: { en: 'Send the receipt and wait for approval.', fa: 'رسید را بفرستید و منتظر تأیید بمانید.' } },
  ],
};

const atelierCopy = {
  kicker: { en: 'Store', fa: 'فروشگاه' },
  headline: { en: 'Find a plan and start in minutes', fa: 'پلن را پیدا کنید و در چند دقیقه شروع کنید' },
  subhead: {
    en: 'Browse categories, compare plans, and check out when you are ready.',
    fa: 'دسته‌ها را ببینید، پلن‌ها را مقایسه کنید و وقتی آماده بودید ادامه دهید.',
  },
  ctaPrimary: { en: 'New order', fa: 'سفارش جدید' },
  ctaSecondary: { en: 'Sign in', fa: 'ورود' },
  ctaTrack: { en: 'Track an order', fa: 'پیگیری سفارش' },
  footerNote: {
    en: 'Need help? Use the support links below.',
    fa: 'کمک لازم دارید؟ از لینک‌های پشتیبانی پایین استفاده کنید.',
  },
  features: [
    { title: { en: 'Clear catalog', fa: 'کاتالوگ روشن' }, body: { en: 'Categories first, then plans.', fa: 'اول دسته، بعد پلن.' } },
    { title: { en: 'Honest specs', fa: 'مشخصات صادقانه' }, body: { en: 'Traffic and duration on every card.', fa: 'ترافیک و مدت روی هر کارت.' } },
    { title: { en: 'Portal later', fa: 'پورتال بعدی' }, body: { en: 'Sign in to renew or track.', fa: 'برای تمدید یا پیگیری وارد شوید.' } },
  ],
};

export const STOREFRONT_STARTERS: Array<{
  key: string;
  slug: string;
  name: string;
  description: string;
  settings: StorefrontSkinSettings;
}> = [
  {
    key: 'atelier',
    slug: 'starter-atelier',
    name: 'Atelier',
    description:
      'Classic storefront: centered hero, category tiles, stacked plan cards. Soft slate chrome.',
    settings: {
      skin: 'atelier',
      layout: 'classic',
      version: 3,
      preview: { accent: '#0D9488', bg: '#F1F5F9', label: 'Classic' },
      copy: atelierCopy,
    },
  },
  {
    key: 'pulse',
    slug: 'starter-pulse',
    name: 'Pulse',
    description:
      'Dark trading-desk shop: neon accents, dense order board, compact plan rows. Built for mobile and Mini App.',
    settings: {
      skin: 'pulse',
      layout: 'market',
      version: 3,
      preview: { accent: '#10B981', bg: '#0B0F0E', label: 'Desk' },
      copy: pulseCopy,
    },
  },
  {
    key: 'lumen',
    slug: 'starter-lumen',
    name: 'Lumen',
    description:
      'Light editorial shop: sidebar + selectable cards, lots of space, a single Continue action.',
    settings: {
      skin: 'lumen',
      layout: 'split',
      version: 3,
      preview: { accent: '#2563EB', bg: '#F8FAFC', label: 'Split' },
      copy: lumenCopy,
    },
  },
  {
    key: 'cascade',
    slug: 'starter-cascade',
    name: 'Cascade',
    description:
      'Glass-on-gradient checkout: frosted cards, status stepper, form-like catalog on a blue-violet field.',
    settings: {
      skin: 'cascade',
      layout: 'funnel',
      version: 3,
      preview: { accent: '#3B82F6', bg: '#4F46E5', label: 'Funnel' },
      copy: cascadeCopy,
    },
  },
];

const SKINS: StorefrontSkinId[] = ['atelier', 'pulse', 'lumen', 'cascade'];
const LAYOUTS: StorefrontLayoutId[] = ['classic', 'market', 'split', 'funnel'];

export function resolveStarterKey(key: string): string {
  const normalized = String(key || '')
    .trim()
    .toLowerCase();
  return STARTER_KEY_ALIASES[normalized] || normalized;
}

export function resolveStorefrontSkin(settings: unknown): StorefrontSkinId {
  if (!settings || typeof settings !== 'object') return 'default';
  let skin = String((settings as StorefrontSkinSettings).skin || '')
    .trim()
    .toLowerCase();
  skin = STARTER_KEY_ALIASES[skin] || skin;
  if (SKINS.includes(skin as StorefrontSkinId)) return skin as StorefrontSkinId;
  return 'default';
}

export function resolveStorefrontLayout(settings: unknown): StorefrontLayoutId {
  if (settings && typeof settings === 'object') {
    let layout = String((settings as StorefrontSkinSettings).layout || '')
      .trim()
      .toLowerCase();
    if (layout === 'minimal') layout = 'split';
    if (layout === 'desk') layout = 'market';
    if (LAYOUTS.includes(layout as StorefrontLayoutId)) return layout as StorefrontLayoutId;
  }
  const skin = resolveStorefrontSkin(settings);
  if (skin === 'pulse') return 'market';
  if (skin === 'lumen') return 'split';
  if (skin === 'cascade') return 'funnel';
  return 'classic';
}

export function sanitizeThemeCss(raw: unknown): string {
  const css = String(raw || '').slice(0, 24_000);
  if (!css.trim()) return '';
  const blocked = /@import|expression\s*\(|javascript\s*:|behavior\s*:|<script|<\/style|url\s*\(\s*['"]?\s*data:/i;
  if (blocked.test(css)) {
    return css
      .replace(/@import[^;]+;?/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, 'none')
      .replace(/javascript\s*:/gi, '')
      .replace(/behavior\s*:[^;]+;?/gi, '')
      .replace(/<\/?script[^>]*>/gi, '')
      .replace(/url\s*\(\s*['"]?\s*data:[^)]*\)/gi, 'none');
  }
  return css;
}
