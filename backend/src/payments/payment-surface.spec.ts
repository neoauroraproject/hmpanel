import {
  parsePaymentSurfaceAssignments,
  resolveSurfaceGateways,
} from './payment-surface';

describe('payment surface assignment', () => {
  it('fills missing surfaces from defaults', () => {
    const parsed = parsePaymentSurfaceAssignments([
      { surface: 'store', allowedGatewayIds: ['zarinpal_stub'], defaultId: 'zarinpal_stub' },
    ]);
    expect(parsed.find((r) => r.surface === 'store')?.defaultId).toBe('zarinpal_stub');
    expect(parsed.find((r) => r.surface === 'add_balance')?.defaultId).toBe('manual_bank');
    expect(parsed.find((r) => r.surface === 'renewal')?.defaultId).toBe('wallet');
  });

  it('intersects assignment with registered gateways', () => {
    const resolved = resolveSurfaceGateways(
      parsePaymentSurfaceAssignments([
        { surface: 'store', allowedGatewayIds: ['wallet', 'missing'], defaultId: 'wallet' },
      ]),
      'store',
      ['manual_bank', 'wallet'],
    );
    expect(resolved.gateways).toEqual(['wallet']);
    expect(resolved.default).toBe('wallet');
  });
});
