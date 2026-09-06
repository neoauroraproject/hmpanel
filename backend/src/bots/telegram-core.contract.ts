/**
 * Core Telegram contract. Store Telegram in Premium must call this surface
 * (or HTTP Core APIs) rather than duplicating createUser / debit logic.
 */
export interface TelegramSendInput {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

export type TelegramSender = (input: TelegramSendInput) => Promise<{ ok: boolean }>;

export class TelegramCoreContract {
  private sender: TelegramSender | null = null;

  registerSender(sender: TelegramSender): void {
    this.sender = sender;
  }

  async sendMessage(input: TelegramSendInput): Promise<{ ok: boolean; skipped?: boolean }> {
    if (!this.sender) return { ok: false, skipped: true };
    return this.sender(input);
  }

  hasSender(): boolean {
    return !!this.sender;
  }
}
