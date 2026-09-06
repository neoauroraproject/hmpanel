import { TelegramCoreContract } from './telegram-core.contract';

describe('TelegramCoreContract', () => {
  it('skips send when no Premium sender is registered', async () => {
    const core = new TelegramCoreContract();
    const result = await core.sendMessage({ chatId: '1', text: 'hi' });
    expect(result.skipped).toBe(true);
  });

  it('delegates to a registered sender', async () => {
    const core = new TelegramCoreContract();
    core.registerSender(async () => ({ ok: true }));
    const result = await core.sendMessage({ chatId: '1', text: 'hi' });
    expect(result).toEqual({ ok: true });
  });
});
