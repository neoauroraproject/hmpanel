import { isBrowserNavigation } from './browser-navigation.util';

describe('isBrowserNavigation', () => {
  it('does not treat empty UA as a browser (VPN/raw)', () => {
    expect(isBrowserNavigation({ headers: {} })).toBe(false);
  });

  it('never redirects when ?raw is set', () => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          accept: 'text/html',
          'sec-fetch-mode': 'navigate',
        },
        query: { raw: '1' },
      }),
    ).toBe(false);
  });

  it('redirects real Chrome document navigation to the portal', () => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'sec-fetch-user': '?1',
        },
      }),
    ).toBe(true);
  });

  it('does not treat Chrome-UA VPN clients without Sec-Fetch navigate as browsers', () => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }),
    ).toBe(false);
  });

  it.each([
    'v2rayNG/1.8.22',
    'v2rayN/7.10.0',
    'HiddifyNext/2.0.5',
    'ClashMeta/1.18',
    'clash-verge/2.2.3',
    'Happ/3.0.0 CFNetwork/1496.0.7 Darwin/23.6.0',
    'V2Box/1.0.0',
    'Streisand/1.0 CFNetwork/1410 Darwin/22.0.0',
    'Shadowrocket/1960 CFNetwork/1410 Darwin',
    'okhttp/4.12.0',
    'Dart/3.4 (dart:io)',
    'MahsaNG/2.0',
    'NekoBox/Android',
    'Karing/1.0',
    'v2raytun/1.0',
  ])('keeps raw body for VPN UA %s', (ua) => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent': ua,
          accept: '*/*',
        },
      }),
    ).toBe(false);
  });

  it('keeps fetch/XHR from a page as raw (sec-fetch-mode cors)', () => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          accept: '*/*',
          'sec-fetch-mode': 'cors',
          'sec-fetch-dest': 'empty',
        },
      }),
    ).toBe(false);
  });

  it('redirects old iOS Safari address-bar visits that lack Sec-Fetch', () => {
    expect(
      isBrowserNavigation({
        headers: {
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }),
    ).toBe(true);
  });
});
