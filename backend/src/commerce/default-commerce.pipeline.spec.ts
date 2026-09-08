import { DefaultCommercePipeline } from './default-commerce.pipeline';

describe('DefaultCommercePipeline', () => {
  it('delegates fulfillment to ProvisioningEngine', async () => {
    const provisioning = {
      provisionUser: jest.fn().mockResolvedValue({ username: 'u1', uuid: 'x' }),
    };
    const pipeline = new DefaultCommercePipeline(provisioning as any);
    const result = await pipeline.fulfill({
      adminId: 'a1',
      panelId: 'p1',
      panelType: '3x-ui',
      client: { username: 'u1' },
    });
    expect(result.subscription.username).toBe('u1');
    expect(provisioning.provisionUser).toHaveBeenCalledTimes(1);
  });
});
