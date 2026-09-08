import { resolveStorefrontSkin, type StorefrontSkinId } from "./skins";

type Pair = { en: string; fa: string };
type Feature = { title: Pair; body: Pair };

export type StorefrontCopy = {
  kicker: string;
  headline: string;
  subhead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaTrack: string;
  availableLabel: string;
  availableHint: string;
  tabPlans: string;
  tabDetails: string;
  tabPay: string;
  orderValue: string;
  chatLabel: string;
  officeLabel: string;
  phoneLabel: string;
  timeLabel: string;
  timeValue: string;
  statusDone: string;
  statusNow: string;
  statusNext: string;
  footerNote: string;
  features: Array<{ title: string; body: string }>;
};

const FALLBACK: Record<Exclude<StorefrontSkinId, "default">, Record<string, Pair | Feature[]>> = {
  atelier: {
    kicker: { en: "Store", fa: "فروشگاه" },
    headline: { en: "Find a plan and start in minutes", fa: "پلن را پیدا کنید و در چند دقیقه شروع کنید" },
    subhead: {
      en: "Browse categories, compare plans, and check out when you are ready.",
      fa: "دسته‌ها را ببینید، پلن‌ها را مقایسه کنید و وقتی آماده بودید ادامه دهید.",
    },
    ctaPrimary: { en: "New order", fa: "سفارش جدید" },
    ctaSecondary: { en: "Sign in", fa: "ورود" },
    ctaTrack: { en: "Track an order", fa: "پیگیری سفارش" },
    footerNote: { en: "Need help? Use the support links below.", fa: "کمک لازم دارید؟ از لینک‌های پشتیبانی پایین استفاده کنید." },
    features: [
      { title: { en: "Clear catalog", fa: "کاتالوگ روشن" }, body: { en: "Categories first, then plans.", fa: "اول دسته، بعد پلن." } },
      { title: { en: "Honest specs", fa: "مشخصات صادقانه" }, body: { en: "Traffic and duration on every card.", fa: "ترافیک و مدت روی هر کارت." } },
      { title: { en: "Portal later", fa: "پورتال بعدی" }, body: { en: "Sign in to renew or track.", fa: "برای تمدید یا پیگیری وارد شوید." } },
    ],
  },
  pulse: {
    kicker: { en: "Catalog", fa: "کاتالوگ" },
    headline: { en: "Place your order", fa: "سفارش خود را ثبت کنید" },
    subhead: {
      en: "Pick a plan, confirm the details, and check out in a few steps.",
      fa: "پلن را انتخاب کنید، جزئیات را تأیید کنید و در چند مرحله پرداخت کنید.",
    },
    ctaPrimary: { en: "Continue", fa: "ادامه" },
    ctaSecondary: { en: "Sign in", fa: "ورود" },
    ctaTrack: { en: "Track an order", fa: "پیگیری سفارش" },
    availableLabel: { en: "Ready to order", fa: "آماده سفارش" },
    availableHint: { en: "Plans update as you select them", fa: "با انتخاب پلن، جزئیات به‌روز می‌شود" },
    tabPlans: { en: "Plans", fa: "پلن‌ها" },
    tabDetails: { en: "Details", fa: "جزئیات" },
    tabPay: { en: "Pay", fa: "پرداخت" },
    orderValue: { en: "Order summary", fa: "خلاصه سفارش" },
    footerNote: { en: "Secure checkout. Support is one tap away.", fa: "پرداخت امن. پشتیبانی همیشه در دسترس است." },
    features: [
      { title: { en: "Live catalog", fa: "کاتالوگ زنده" }, body: { en: "See every available plan in one board.", fa: "همه پلن‌های فعال در یک صفحه." } },
      { title: { en: "Fast checkout", fa: "تسویه سریع" }, body: { en: "Confirm details and submit in seconds.", fa: "جزئیات را تأیید کنید و سریع ثبت کنید." } },
      { title: { en: "Clear fees", fa: "هزینه شفاف" }, body: { en: "Price, traffic, and duration stay visible.", fa: "قیمت، ترافیک و مدت همیشه مشخص است." } },
    ],
  },
  lumen: {
    kicker: { en: "Get started", fa: "شروع کنید" },
    headline: { en: "We’d love to help you get started", fa: "خوشحال می‌شویم کمکتان کنیم شروع کنید" },
    subhead: {
      en: "Choose what you need, then continue to the catalog.",
      fa: "آنچه لازم دارید را انتخاب کنید و به کاتالوگ بروید.",
    },
    ctaPrimary: { en: "Continue", fa: "ادامه" },
    ctaSecondary: { en: "Sign in", fa: "ورود" },
    ctaTrack: { en: "Track an order", fa: "پیگیری سفارش" },
    chatLabel: { en: "Chat with us", fa: "گفتگو با ما" },
    officeLabel: { en: "Website", fa: "وب‌سایت" },
    phoneLabel: { en: "Direct contact", fa: "تماس مستقیم" },
    footerNote: { en: "Simple catalog. Clear prices. Help whenever you need it.", fa: "کاتالوگ ساده. قیمت شفاف. پشتیبانی هر زمان لازم بود." },
    features: [
      { title: { en: "Browse plans", fa: "مرور پلن‌ها" }, body: { en: "A clean list of everything currently offered.", fa: "فهرست مرتب همه پیشنهادهای فعلی." } },
      { title: { en: "Guided checkout", fa: "خرید راهنمایی‌شده" }, body: { en: "One path from category to payment.", fa: "یک مسیر از دسته تا پرداخت." } },
      { title: { en: "Account portal", fa: "پورتال مشتری" }, body: { en: "Renew, track, and manage services later.", fa: "تمدید، پیگیری و مدیریت سرویس‌ها بعداً." } },
      { title: { en: "Transparent limits", fa: "محدودیت شفاف" }, body: { en: "Traffic and duration are shown up front.", fa: "ترافیک و مدت از ابتدا مشخص است." } },
      { title: { en: "Priority help", fa: "پشتیبانی سریع" }, body: { en: "Reach the store through the channels they enabled.", fa: "از کانال‌هایی که فروشگاه فعال کرده تماس بگیرید." } },
      { title: { en: "Mobile ready", fa: "آماده موبایل" }, body: { en: "The same layout works in the browser and Mini App.", fa: "همین چیدمان در مرورگر و مینی‌اپ کار می‌کند." } },
    ],
  },
  cascade: {
    kicker: { en: "Checkout", fa: "تسویه" },
    headline: { en: "Complete your order in a few calm steps", fa: "سفارش را در چند مرحله آرام تمام کنید" },
    subhead: {
      en: "Follow the stepper, fill in only what is needed, and submit when you are ready.",
      fa: "Stepper را دنبال کنید، فقط فیلدهای لازم را پر کنید و وقتی آماده بودید ثبت کنید.",
    },
    ctaPrimary: { en: "Next", fa: "بعدی" },
    ctaSecondary: { en: "Previous", fa: "قبلی" },
    ctaTrack: { en: "Track an order", fa: "پیگیری سفارش" },
    timeLabel: { en: "Typical review", fa: "زمان بررسی معمول" },
    timeValue: { en: "A few minutes", fa: "چند دقیقه" },
    statusDone: { en: "Completed", fa: "انجام شد" },
    statusNow: { en: "In progress", fa: "در حال انجام" },
    statusNext: { en: "Pending", fa: "در انتظار" },
    footerNote: {
      en: "Your details stay on this store. You can go back a step at any time.",
      fa: "اطلاعات فقط در همین فروشگاه می‌ماند. هر زمان می‌توانید یک مرحله برگردید.",
    },
    features: [
      { title: { en: "Catalog", fa: "کاتالوگ" }, body: { en: "Choose a category and a plan.", fa: "دسته و پلن را انتخاب کنید." } },
      { title: { en: "Details", fa: "جزئیات" }, body: { en: "Add-ons and a config name if needed.", fa: "افزونه و نام کانفیگ در صورت نیاز." } },
      { title: { en: "Payment", fa: "پرداخت" }, body: { en: "Send the receipt and wait for approval.", fa: "رسید را بفرستید و منتظر تأیید بمانید." } },
    ],
  },
};

const EMPTY_PAIR: Pair = { en: "", fa: "" };

function pickPair(value: unknown, fallback: Pair | undefined, isFa: boolean): string {
  const fb = fallback || EMPTY_PAIR;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as { en?: unknown; fa?: unknown };
    const chosen = isFa ? rec.fa ?? rec.en : rec.en ?? rec.fa;
    if (typeof chosen === "string" && chosen.trim()) return chosen;
  }
  return isFa ? fb.fa : fb.en;
}

function pickFeatures(value: unknown, fallback: Feature[], isFa: boolean) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.slice(0, 8).map((item) => {
    const rec = item && typeof item === "object" ? (item as { title?: unknown; body?: unknown }) : {};
    const fb = fallback[0] || {
      title: { en: "", fa: "" },
      body: { en: "", fa: "" },
    };
    return {
      title: pickPair(rec.title, fb.title, isFa),
      body: pickPair(rec.body, fb.body, isFa),
    };
  });
}

export function resolveStorefrontCopy(settings: unknown, isFa: boolean): StorefrontCopy {
  const skin = resolveStorefrontSkin(settings);
  const pack = skin === "default" ? FALLBACK.atelier : FALLBACK[skin];
  const raw =
    settings && typeof settings === "object" && (settings as { copy?: unknown }).copy &&
    typeof (settings as { copy?: unknown }).copy === "object"
      ? ((settings as { copy: Record<string, unknown> }).copy)
      : {};

  const text = (key: string) => pickPair(raw[key], pack[key] as Pair | undefined, isFa);

  return {
    kicker: text("kicker"),
    headline: text("headline"),
    subhead: text("subhead"),
    ctaPrimary: text("ctaPrimary") || (isFa ? "ادامه" : "Continue"),
    ctaSecondary: text("ctaSecondary") || (isFa ? "ورود" : "Sign in"),
    ctaTrack: text("ctaTrack") || (isFa ? "پیگیری سفارش" : "Track an order"),
    availableLabel: text("availableLabel"),
    availableHint: text("availableHint"),
    tabPlans: text("tabPlans"),
    tabDetails: text("tabDetails"),
    tabPay: text("tabPay"),
    orderValue: text("orderValue"),
    chatLabel: text("chatLabel"),
    officeLabel: text("officeLabel"),
    phoneLabel: text("phoneLabel"),
    timeLabel: text("timeLabel"),
    timeValue: text("timeValue"),
    statusDone: text("statusDone"),
    statusNow: text("statusNow"),
    statusNext: text("statusNext"),
    footerNote: text("footerNote"),
    features: pickFeatures(raw.features, (pack.features as Feature[]) || [], isFa),
  };
}
