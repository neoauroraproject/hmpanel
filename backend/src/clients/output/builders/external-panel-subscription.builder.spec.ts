import { buildExternalPanelSubscriptionOutput } from './external-panel-subscription.builder';

describe('buildExternalPanelSubscriptionOutput', () => {
  it('returns subscription output with QR text', () => {
    const model = buildExternalPanelSubscriptionOutput({
      clientId: 'c1',
      protocol: 'eylan',
      nativeSubUrl: 'https://api.example.com/sub/tok/user',
      systemSubUrl: 'https://cdn.example.com/sub/tok/user',
    });
    expect(model.outputType).toBe('subscription');
    expect(model.payload.qrText).toBe('https://cdn.example.com/sub/tok/user');
    expect(model.payload.nativeSubUrl).toBe('https://api.example.com/sub/tok/user');
    expect(model.warnings).toEqual([]);
  });
});
