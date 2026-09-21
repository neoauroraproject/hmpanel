import {
  collectPublicNativeSubscriptionUrls,
  customerFacingSubscriptionUrl,
  panelApiHostnames,
  panelDeliveryHostnames,
  panelSubUrlHostnames,
  rewriteSubscriptionDeliveryHost,
  subscriptionUrlFromProviderMeta,
} from './native-sub-url';

describe('native-sub-url extras', () => {
  it('reads subscriptionUrl from providerMeta', () => {
    expect(
      subscriptionUrlFromProviderMeta({
        subscriptionUrl: 'https://api.example.com/sub/tok/user',
      }),
    ).toBe('https://api.example.com/sub/tok/user');
    expect(subscriptionUrlFromProviderMeta({})).toBeNull();
  });

  it('rewrites only the hostname from panel.subUrl', () => {
    expect(
      rewriteSubscriptionDeliveryHost(
        'https://api.eylan.test/sub/TOKEN/alice',
        'https://cdn.vpn.test/',
      ),
    ).toBe('https://cdn.vpn.test/sub/TOKEN/alice');
  });

  it('prefers native provider URL over store /s/ link', () => {
    expect(
      customerFacingSubscriptionUrl({
        providerMeta: { subscriptionUrl: 'https://api.pg.test/sub/abc/user' },
        panelSubUrl: 'https://cdn.vpn.test',
        storeSubUrl: 'https://shop.test/s/token',
      }),
    ).toBe('https://cdn.vpn.test/sub/abc/user');
  });

  it('falls back to store /s/ link when provider meta has no URL', () => {
    expect(
      customerFacingSubscriptionUrl({
        providerMeta: {},
        storeSubUrl: 'https://shop.test/s/token',
      }),
    ).toBe('https://shop.test/s/token');
  });

  it('collects only panel.subUrl for config feeds, not the API host', () => {
    expect(
      collectPublicNativeSubscriptionUrls(
        [
          { panel: { subUrl: 'https://cdn.vpn.test/sub', url: 'https://panel.wrong.test:2053' } },
          { panel: { url: 'https://panel.only-api.test:2053' } },
        ],
        'abc',
      ),
    ).toEqual(['https://cdn.vpn.test/sub/abc']);
  });

  it('lists panel API hostnames for stamp detection', () => {
    expect(
      panelApiHostnames([
        { panel: { url: 'https://panel.wrong.test:2053/path' } },
      ]),
    ).toEqual(['panel.wrong.test']);
  });

  it('lists both API and subscription CDN hosts as delivery stamps', () => {
    expect(
      panelDeliveryHostnames([
        {
          panel: {
            url: 'https://panel.api.test:2053',
            subUrl: 'https://b1sub.hmray.pro/sub',
          },
        },
      ]).sort(),
    ).toEqual(['b1sub.hmray.pro', 'panel.api.test']);
  });

  it('lists subscription CDN hosts separately from the API host', () => {
    expect(
      panelSubUrlHostnames([
        { panel: { subUrl: 'https://b1sub.hmray.pro/sub' } },
      ]),
    ).toEqual(['b1sub.hmray.pro']);
  });
});
