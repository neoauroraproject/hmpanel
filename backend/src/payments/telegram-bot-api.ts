import axios from 'axios';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function methodUrl(botToken: string, method: string) {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
}

/** Direct Bot API JSON calls — Community must not import Premium `plugins/shared`. */
export async function telegramGetJson(
  botToken: string,
  method: string,
  timeout = 12_000,
): Promise<any> {
  const { data } = await axios.get(methodUrl(botToken, method), { timeout });
  return data;
}

export async function telegramPostJson(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
  timeout = 15_000,
): Promise<any> {
  const { data } = await axios.post(methodUrl(botToken, method), payload, {
    timeout,
  });
  return data;
}
