import {
  chunkArray,
  inboundSyncFieldsChanged,
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
});
