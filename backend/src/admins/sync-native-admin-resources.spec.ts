import { normalizeNativeResources } from './sync-native-admin-resources';

describe('normalizeNativeResources', () => {
  it('keeps OpenVPN / WireGuard instance ids and labels', () => {
    expect(
      normalizeNativeResources([
        { resourceId: 'OpenVPN', resourceName: 'OpenVPN' },
        { resourceId: 'wg1', resourceName: 'WireGuard (wg1)' },
        { resourceId: 'OpenVPN', resourceName: 'dup' },
      ]),
    ).toEqual([
      { resourceId: 'OpenVPN', resourceName: 'OpenVPN' },
      { resourceId: 'wg1', resourceName: 'WireGuard (wg1)' },
    ]);
  });

  it('accepts bare Pasarguard group ids', () => {
    expect(normalizeNativeResources(['12', ' 12 ', '']))
      .toEqual([{ resourceId: '12', resourceName: '12' }]);
  });
});
