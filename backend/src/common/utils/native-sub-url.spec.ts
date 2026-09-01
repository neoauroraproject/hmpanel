import {
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
});
