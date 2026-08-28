/** Default branding for the admin panel UI only (not storefront / portal). */
export const PANEL_BRAND = {
  name: "HM Panel",
  nameFa: "اچ‌ام پنل",
  title: "HM Panel — 3x-ui Reseller Management",
  titleFa: "اچ‌ام پنل — مدیریت نمایندگی 3x-ui",
  description:
    "Multi-server 3x-ui reseller management panel for admins and resellers.",
  descriptionFa: "پنل مدیریت نمایندگی چندسرور 3x-ui برای ادمین و نمایندگان.",
  logoPath: "/brand/hmpanel-logo.png",
} as const;

export const PANEL_METADATA = {
  title: PANEL_BRAND.title,
  description: PANEL_BRAND.description,
  icons: {
    icon: PANEL_BRAND.logoPath,
    apple: PANEL_BRAND.logoPath,
  },
} as const;
