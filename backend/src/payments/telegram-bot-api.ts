import axios from 'axios';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function methodUrl(botToken: string, method: string) {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
}

/**
 * Optional transport registered by Premium (Telegram proxy settings).
 * Community must not import Premium `plugins/shared`, so Premium plugs in here.
 */
export type TelegramBotApiTransport = {
  getTelegramJson(botToken: string, method: string, timeout?: number): Promise<any>;
  postTelegramJson(
    botToken: string,
    method: string,
    payload: Record<string, unknown>,
    timeout?: number,
  ): Promise<any>;
};

let transport: TelegramBotApiTransport | null = null;

export function registerTelegramBotApiTransport(t: TelegramBotApiTransport | null) {
  transport = t;
}

/** Direct Bot API JSON calls unless Premium registered its proxied transport. */
export async function telegramGetJson(
  botToken: string,
  method: string,
  timeout = 12_000,
): Promise<any> {
  if (transport) return transport.getTelegramJson(botToken, method, timeout);
  const { data } = await axios.get(methodUrl(botToken, method), { timeout });
  return data;
}

export async function telegramPostJson(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
  timeout = 15_000,
): Promise<any> {
  if (transport) {
    return transport.postTelegramJson(botToken, method, payload, timeout);
  }
  const { data } = await axios.post(methodUrl(botToken, method), payload, {
    timeout,
  });
  return data;
}
