import { defineConfig, type DefaultTheme } from "vitepress";

const REPO = "https://github.com/neoauroraproject/hmpanel";
const CHANNEL = "https://t.me/hmpanel";
const SUPPORT = "https://t.me/hmraysupport";

function sidebar(prefix: string, fa: boolean): DefaultTheme.SidebarItem[] {
  return [
    {
      text: fa ? "شروع" : "Start",
      items: [{ text: fa ? "نصب" : "Installation", link: `${prefix}/guide/install` }],
    },
    {
      text: fa ? "رایگان" : "Community",
      items: [
        { text: fa ? "داشبورد" : "Dashboard", link: `${prefix}/community/dashboard` },
        { text: fa ? "کلاینت‌ها" : "Clients", link: `${prefix}/community/clients` },
        { text: fa ? "پنل‌ها" : "Panels", link: `${prefix}/community/panels` },
        { text: fa ? "تنظیمات" : "Settings", link: `${prefix}/community/settings` },
      ],
    },
    {
      text: fa ? "پرمیوم" : "Premium",
      items: [
        { text: fa ? "لایسنس" : "License", link: `${prefix}/premium/license` },
        { text: fa ? "فروشگاه" : "Store", link: `${prefix}/premium/store` },
        { text: fa ? "ماژول‌ها" : "Modules", link: `${prefix}/premium/modules` },
      ],
    },
    {
      text: fa ? "مقایسه" : "Compare",
      items: [{ text: fa ? "رایگان و پرمیوم" : "Editions", link: `${prefix}/compare` }],
    },
  ];
}

const footerEn = {
  message: `<a href="${REPO}">GitHub</a><a href="${CHANNEL}">Telegram</a><a href="${SUPPORT}">License</a>`,
  copyright: "HMPanel",
};

const footerFa = {
  message: `<a href="${REPO}">GitHub</a><a href="${CHANNEL}">تلگرام</a><a href="${SUPPORT}">مجوز</a>`,
  copyright: "HMPanel",
};

export default defineConfig({
  base: "/hmpanel/",
  title: "HMPanel",
  description: "Documentation for HMPanel Community and Premium editions.",
  lastUpdated: false,
  cleanUrls: false,
  ignoreDeadLinks: false,
  head: [
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/rastikerdar/vazir-font@v30.1.0/dist/font-face.css",
      },
    ],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: [
          { text: "Installation", link: "/guide/install" },
          { text: "Community", link: "/community/dashboard" },
          { text: "Premium", link: "/premium/license" },
          { text: "Compare", link: "/compare" },
        ],
        sidebar: sidebar("", false),
        socialLinks: [{ icon: "github", link: REPO }],
        outline: { level: 2 },
        footer: footerEn,
      },
    },
    fa: {
      label: "فارسی",
      lang: "fa-IR",
      dir: "rtl",
      link: "/fa/",
      themeConfig: {
        nav: [
          { text: "نصب", link: "/fa/guide/install" },
          { text: "رایگان", link: "/fa/community/dashboard" },
          { text: "پرمیوم", link: "/fa/premium/license" },
          { text: "مقایسه", link: "/fa/compare" },
        ],
        sidebar: sidebar("/fa", true),
        socialLinks: [{ icon: "github", link: REPO }],
        outline: { level: 2, label: "در این صفحه" },
        footer: footerFa,
        docFooter: { prev: "قبلی", next: "بعدی" },
        darkModeSwitchLabel: "ظاهر",
        sidebarMenuLabel: "منو",
        returnToTopLabel: "بالا",
        langMenuLabel: "زبان",
      },
    },
  },
  themeConfig: {
    siteTitle: "HMPanel",
    search: { provider: "local" },
  },
});
