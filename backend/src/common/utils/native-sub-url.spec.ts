import {
  customerFacingSubscriptionUrl,
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
});
