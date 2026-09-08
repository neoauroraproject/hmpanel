import {
  signWebhookBody,
  WebhookDispatcher,
} from './webhook-dispatcher.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';

describe('WebhookDispatcher', () => {
  it('signs the JSON body', () => {
    expect(signWebhookBody('secret', '{"a":1}').startsWith('sha256=')).toBe(true);
  });

  it('no-ops when outbound_webhooks_v1 is off', async () => {
    const posts: string[] = [];
    const dispatcher = new WebhookDispatcher(
      { botApiClient: { findMany: jest.fn() } } as any,
      { isEnabled: async (flag: string) => flag !== PLATFORM_FLAGS.OUTBOUND_WEBHOOKS_V1 } as any,
      { on: () => () => undefined } as any,
    );
    dispatcher.postImpl = async (url) => {
      posts.push(url);
    };
    const sent = await dispatcher.dispatch({
      type: 'payment.completed',
      occurredAt: new Date().toISOString(),
      payload: { orderId: 'o1' },
    });
    expect(sent).toBe(0);
    expect(posts).toEqual([]);
  });

  it('posts allowlisted events to scoped webhook URLs', async () => {
    const posts: Array<{ url: string; body: string }> = [];
    const dispatcher = new WebhookDispatcher(
      {
        botApiClient: {
          findMany: async () => [
            {
              webhookUrl: 'https://hooks.example/bot',
              keyHash: 'hash',
              scopes: ['webhooks.manage'],
            },
          ],
        },
      } as any,
      { isEnabled: async () => true } as any,
      { on: () => () => undefined } as any,
    );
    dispatcher.postImpl = async (url, body) => {
      posts.push({ url, body });
    };
    const sent = await dispatcher.dispatch({
      type: 'payment.completed',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { orderId: 'o1' },
    });
    expect(sent).toBe(1);
    expect(posts[0].url).toBe('https://hooks.example/bot');
    expect(JSON.parse(posts[0].body).type).toBe('payment.completed');
  });
});
