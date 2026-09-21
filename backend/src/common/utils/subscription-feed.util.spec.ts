import {
  looksLikeClashYaml,
  looksLikeSingboxJson,
  nativeFetchUserAgent,
  tryDecodeSubBody,
} from './subscription-feed.util';

describe('subscription-feed.util', () => {
  it('detects Clash YAML', () => {
    expect(
      looksLikeClashYaml('mixed-port: 7890\nproxies:\n  - name: a\n'),
    ).toBe(true);
    expect(looksLikeClashYaml('vless://uuid@host:443')).toBe(false);
  });

  it('detects sing-box JSON and does not base64-wrap it', () => {
    const json = '{"outbounds":[{"type":"vless"}],"inbounds":[]}';
    expect(looksLikeSingboxJson(json)).toBe(true);
    expect(tryDecodeSubBody(json)).toBe(json);
  });

  it('decodes base64 URI lists', () => {
    const body = 'vless://uuid@example.com:443?type=tcp#node';
    const b64 = Buffer.from(body).toString('base64');
    expect(tryDecodeSubBody(b64)).toBe(body);
  });

  it('forwards Clash/Hiddify UAs and keeps a v2rayNG fallback otherwise', () => {
    expect(nativeFetchUserAgent('clash-verge/2.2.3', 'v2rayNG/1.10.0')).toBe(
      'clash-verge/2.2.3',
    );
    expect(
      nativeFetchUserAgent(
        'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
        'v2rayNG/1.10.0',
      ),
    ).toBe('v2rayNG/1.10.0');
  });
});
