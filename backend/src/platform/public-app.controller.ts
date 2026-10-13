import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureEntitlementService } from './feature-entitlement.service';
import { PremiumBundleService } from './premium-bundle.service';
import { getAppVersion } from '../common/utils/app-version';
import { fetchPanelAds } from './panel-ads.util';

/** SystemSetting key written by the premium reseller-shell module. */
export const PANEL_APP_BRAND_KEY = 'panel_app_brand';

export type PanelAppBrand = {
  name: string;
  nameFa: string;
  shortName: string;
  logo: string;
  iconBg: string;
  themeColor: string;
  backgroundColor: string;
  showGithub: boolean;
  icons: {
    icon192: string;
    icon512: string;
    maskable512: string;
    apple180: string;
  };
  rev: string;
  custom: boolean;
};

const DEFAULT_BRAND: PanelAppBrand = {
  name: 'HM Panel',
  nameFa: 'اچ‌ام پنل',
  shortName: 'HM Panel',
  logo: '',
  iconBg: 'midnight',
  themeColor: '#09090b',
  backgroundColor: '#09090b',
  showGithub: false,
  icons: {
    icon192: '/pwa/icon-192.png',
    icon512: '/pwa/icon-512.png',
    maskable512: '/pwa/maskable-512.png',
    apple180: '/pwa/apple-touch-180.png',
  },
  rev: 'default',
  custom: false,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_URL = /^\/[A-Za-z0-9/_.\-]+$/;

function str(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeUrl(v: unknown, fallback: string): string {
  const s = str(v, 300);
  return SAFE_URL.test(s) ? s : fallback;
}

function withRev(url: string, rev: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(rev)}`;
}

@ApiTags('Public')
@Controller('public')
export class PublicAppController {
  constructor(
    private prisma: PrismaService,
    private entitlement: FeatureEntitlementService,
    private bundle: PremiumBundleService,
  ) {}

  private async loadBrand(): Promise<PanelAppBrand> {
    try {
      if (!(await this.entitlement.can('premium'))) return DEFAULT_BRAND;
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: PANEL_APP_BRAND_KEY },
      });
      if (!row?.value) return DEFAULT_BRAND;
      const raw = JSON.parse(row.value) as Record<string, unknown>;
      const icons = (raw.icons ?? {}) as Record<string, unknown>;
      const name = str(raw.name) || DEFAULT_BRAND.name;
      return {
        name,
        nameFa: str(raw.nameFa) || (str(raw.name) ? name : DEFAULT_BRAND.nameFa),
        shortName: str(raw.shortName, 24) || name.slice(0, 24),
        logo: safeUrl(raw.logo, ''),
        iconBg: str(raw.iconBg, 20) || DEFAULT_BRAND.iconBg,
        themeColor: HEX.test(str(raw.themeColor)) ? str(raw.themeColor) : DEFAULT_BRAND.themeColor,
        backgroundColor: HEX.test(str(raw.backgroundColor))
          ? str(raw.backgroundColor)
          : DEFAULT_BRAND.backgroundColor,
        showGithub: raw.showGithub === true,
        icons: {
          icon192: safeUrl(icons.icon192, DEFAULT_BRAND.icons.icon192),
          icon512: safeUrl(icons.icon512, DEFAULT_BRAND.icons.icon512),
          maskable512: safeUrl(icons.maskable512, DEFAULT_BRAND.icons.maskable512),
          apple180: safeUrl(icons.apple180, DEFAULT_BRAND.icons.apple180),
        },
        rev: str(raw.rev, 40) || 'custom',
        custom: true,
      };
    } catch {
      return DEFAULT_BRAND;
    }
  }

  @Get('app-brand')
  @Header('Cache-Control', 'no-cache')
  async appBrand() {
    return this.loadBrand();
  }

  @Get('app-version')
  @Header('Cache-Control', 'no-store')
  appVersion() {
    return {
      app: getAppVersion(),
      premium: this.bundle.getInstalledVersion(),
    };
  }

  /** Community dashboard ads — no license key; proxied to avoid browser CORS. */
  @Get('ads')
  @Header('Cache-Control', 'public, max-age=120')
  @ApiOperation({ summary: 'Community edition promotional ads for the dashboard' })
  async ads() {
    return fetchPanelAds();
  }

  @Get('manifest.webmanifest')
  async manifest(@Res() res: Response) {
    const b = await this.loadBrand();
    const icon = (src: string, sizes: string, purpose: string) => ({
      src: withRev(src, b.rev),
      sizes,
      type: 'image/png',
      purpose,
    });
    const body = {
      id: '/?app=hmpanel',
      name: b.nameFa || b.name,
      short_name: b.shortName,
      description: b.name,
      lang: 'fa',
      dir: 'rtl',
      start_url: '/dashboard?source=pwa',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait',
      background_color: b.backgroundColor,
      theme_color: b.themeColor,
      icons: [
        icon(b.icons.icon192, '192x192', 'any'),
        icon(b.icons.icon512, '512x512', 'any'),
        icon(b.icons.maskable512, '512x512', 'maskable'),
      ],
      shortcuts: [
        { name: 'داشبورد', short_name: 'داشبورد', url: '/dashboard?source=pwa' },
        { name: 'کاربران', short_name: 'کاربران', url: '/clients?source=pwa' },
        { name: 'ترافیک', short_name: 'ترافیک', url: '/traffic?source=pwa' },
      ],
    };
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(JSON.stringify(body));
  }
}
