import {
  chunkArray,
  inboundFingerprint,
  inboundSyncFieldsChanged,
  parseInboundJson,
  syncJsonEqual,
} from './panel-sync.util';

describe('panel-sync.util', () => {
  it('chunks arrays', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('ignores generatedAt when comparing JSON envelopes', () => {
    expect(
      syncJsonEqual(
        { protocol: 'wireguard', generatedAt: '2026-01-01', payload: { a: 1 } },
        { protocol: 'wireguard', generatedAt: '2026-09-19', payload: { a: 1 } },
      ),
    ).toBe(true);
    expect(
      syncJsonEqual(
        { protocol: 'wireguard', payload: { a: 1 } },
        { protocol: 'wireguard', payload: { a: 2 } },
      ),
    ).toBe(false);
  });

  it('detects inbound field changes', () => {
    const base = {
      panelInboundId: 1,
      tag: 'a',
      remark: null,
      port: 443,
      protocol: 'vless',
      settings: { clients: [] },
      streamSettings: {},
      nodeId: null,
      nodeName: null,
      originNodeGuid: null,
    };
    expect(inboundSyncFieldsChanged(base, { ...base })).toBe(false);
    expect(
      inboundSyncFieldsChanged(base, { ...base, port: 8443 }),
    ).toBe(true);
  });

  it('parses inbound JSON from strings, objects and empty values', () => {
    expect(parseInboundJson('{"clients":[1]}')).toEqual({ clients: [1] });
    expect(parseInboundJson('')).toEqual({});
    expect(parseInboundJson(null)).toEqual({});
    expect(parseInboundJson({ a: 1 })).toEqual({ a: 1 });
  });

  describe('inboundFingerprint', () => {
    const inbound = {
      settings: '{"clients":[{"email":"a"}]}',
      streamSettings: '{"network":"tcp"}',
    };
    const fields = [1, 'remark', 443, 'vless', null, null, null];

    it('is stable for an unchanged inbound', () => {
      expect(inboundFingerprint({ ...inbound }, [...fields])).toBe(
        inboundFingerprint(inbound, fields),
      );
    });

    it('changes when settings, stream settings or scalar fields change', () => {
      const base = inboundFingerprint(inbound, fields);
      expect(
        inboundFingerprint(
          { ...inbound, settings: '{"clients":[{"email":"b"}]}' },
          fields,
        ),
      ).not.toBe(base);
      expect(
        inboundFingerprint({ ...inbound, streamSettings: '{"network":"ws"}' }, fields),
      ).not.toBe(base);
      expect(
        inboundFingerprint(inbound, [1, 'remark', 8443, 'vless', null, null, null]),
      ).not.toBe(base);
      expect(
        inboundFingerprint(inbound, [1, 'remark', 443, 'vless', 2, 'node-a', null]),
      ).not.toBe(base);
    });

    it('does not let settings text bleed into stream settings', () => {
      expect(
        inboundFingerprint({ settings: 'ab', streamSettings: 'c' }, fields),
      ).not.toBe(inboundFingerprint({ settings: 'a', streamSettings: 'bc' }, fields));
    });

    it('accepts object-typed settings from older panels', () => {
      expect(
        inboundFingerprint({ settings: { clients: [] }, streamSettings: null }, fields),
      ).toBe(
        inboundFingerprint({ settings: { clients: [] }, streamSettings: undefined }, fields),
      );
    });
  });
});
