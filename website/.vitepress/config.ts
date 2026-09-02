import { defineConfig, type DefaultTheme } from "vitepress";

const REPO = "https://github.com/neoauroraproject/hmpanel";
const CHANNEL = "https://t.me/hmpanel";
const SUPPORT = "https://t.me/hmraysupport";

function communitySidebar(prefix: string): DefaultTheme.SidebarItem[] {
  return [
    {
      text: prefix === "/fa" ? "راهنما" : "Guide",
      items: [
        { text: prefix === "/fa" ? "نصب" : "Install", link: `${prefix}/guide/install` },
        { text: prefix === "/fa" ? "ورود" : "Login", link: `${prefix}/guide/login` },
        { text: prefix === "/fa" ? "خط فرمان hm" : "CLI (hm)", link: `${prefix}/guide/cli` },
      ],
    },
    {
      text: prefix === "/fa" ? "نسخه رایگان (Community)" : "Community",
      items: [
        { text: prefix === "/fa" ? "داشبورد" : "Dashboard", link: `${prefix}/community/dashboard` },
        { text: prefix === "/fa" ? "ادمین‌ها" : "Admins", link: `${prefix}/community/admins` },
        { text: prefix === "/fa" ? "کلاینت‌ها" : "Clients", link: `${prefix}/community/clients` },
        { text: prefix === "/fa" ? "پنل‌ها" : "Panels", link: `${prefix}/community/panels` },
        { text: prefix === "/fa" ? "ترافیک" : "Traffic", link: `${prefix}/community/traffic` },
        { text: prefix === "/fa" ? "مهاجرت" : "Migration", link: `${prefix}/community/migration` },
        { text: prefix === "/fa" ? "تنظیمات" : "Settings", link: `${prefix}/community/settings` },
        { text: prefix === "/fa" ? "پاکسازی" : "Cleanup", link: `${prefix}/community/cleanup` },
        { text: prefix === "/fa" ? "عیب‌یابی" : "Diagnostics", link: `${prefix}/community/diagnostics` },
        { text: prefix === "/fa" ? "پورتال اشتراک" : "Subscription portal", link: `${prefix}/community/portal` },
      ],
    },
    {
      text: prefix === "/fa" ? "نسخه پرمیوم" : "Premium",
      items: [
        { text: prefix === "/fa" ? "لایسنس و باندل" : "License & bundle", link: `${prefix}/premium/license` },
        { text: prefix === "/fa" ? "تنظیمات پرمیوم" : "Premium Settings", link: `${prefix}/premium/settings` },
        { text: prefix === "/fa" ? "برندینگ" : "Branding", link: `${prefix}/premium/branding` },
        { text: prefix === "/fa" ? "دامنه سفارشی" : "Custom Domains", link: `${prefix}/premium/custom-domains` },
        { text: prefix === "/fa" ? "قالب کلاینت" : "Client Templates", link: `${prefix}/premium/client-templates` },
        { text: prefix === "/fa" ? "فروشگاه" : "Store", link: `${prefix}/premium/store` },
        { text: prefix === "/fa" ? "شارژ ادمین" : "Admin Recharge", link: `${prefix}/premium/admin-recharge` },
        { text: prefix === "/fa" ? "Panel Plus" : "Panel Plus", link: `${prefix}/premium/panel-plus` },
        { text: prefix === "/fa" ? "مانیتورینگ پرو" : "Monitoring Pro", link: `${prefix}/premium/monitoring-pro` },
        { text: prefix === "/fa" ? "مرکز بکاپ" : "Backup Center", link: `${prefix}/premium/backup-center` },
      ],
    },
    {
      text: prefix === "/fa" ? "مقایسه" : "Compare",
      items: [{ text: prefix === "/fa" ? "Community در برابر Premium" : "Community vs Premium", link: `${prefix}/compare` }],
    },
  ];
}

const enNav: DefaultTheme.NavItem[] = [
  { text: "Guide", link: "/guide/install" },
  { text: "Community", link: "/community/dashboard" },
  { text: "Premium", link: "/premium/license" },
  { text: "Compare", link: "/compare" },
  { text: "GitHub", link: REPO },
  { text: "Telegram", link: CHANNEL },
  { text: "Buy license", link: SUPPORT },
];

const faNav: DefaultTheme.NavItem[] = [
  { text: "راهنما", link: "/fa/guide/install" },
  { text: "رایگان", link: "/fa/community/dashboard" },
  { text: "پرمیوم", link: "/fa/premium/license" },
  { text: "مقایسه", link: "/fa/compare" },
  { text: "گیت‌هاب", link: REPO },
  { text: "کانال", link: CHANNEL },
  { text: "خرید لایسنس", link: SUPPORT },
];

const socialLinks: DefaultTheme.SocialLink[] = [
  { icon: "github", link: REPO },
];

export default defineConfig({
  base: "/hmpanel/",
  title: "HMPanel",
  description: "Operator wiki for HMPanel Community and Premium, written from the real UI and APIs.",
  lastUpdated: true,
  cleanUrls: false,
  ignoreDeadLinks: false,
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: enNav,
        sidebar: communitySidebar(""),
        socialLinks,
        outline: { level: [2, 3] },
        footer: {
          message: `GitHub: <a href="${REPO}">neoauroraproject/hmpanel</a> · Channel: <a href="${CHANNEL}">t.me/hmpanel</a> · License / support: <a href="${SUPPORT}">t.me/hmraysupport</a>`,
          copyright: "HMPanel Community Edition",
        },
      },
    },
    fa: {
      label: "فارسی",
      lang: "fa-IR",
      dir: "rtl",
      link: "/fa/",
      themeConfig: {
        nav: faNav,
        sidebar: communitySidebar("/fa"),
        socialLinks,
        outline: { level: [2, 3], label: "در این صفحه" },
        footer: {
          message: `گیت‌هاب: <a href="${REPO}">neoauroraproject/hmpanel</a> · کانال: <a href="${CHANNEL}">t.me/hmpanel</a> · خرید لایسنس: <a href="${SUPPORT}">t.me/hmraysupport</a>`,
          copyright: "نسخه رایگان اچ‌ام‌پنل",
        },
        docFooter: { prev: "قبلی", next: "بعدی" },
        lastUpdatedText: "آخرین به‌روزرسانی",
        darkModeSwitchLabel: "ظاهر",
        sidebarMenuLabel: "منو",
        returnToTopLabel: "بازگشت به بالا",
      },
    },
  },
  themeConfig: {
    siteTitle: "HMPanel",
    logo: false,
    search: { provider: "local" },
  },
});
