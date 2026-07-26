/**
 * Normalize Telegram support input to an absolute https://t.me/... URL.
 * Accepts @username, username, t.me/user, or full https URLs.
 */
export function normalizeTelegramLink(input?: string | null): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (host === "t.me" || host === "telegram.me" || host === "telegram.dog") {
        const user = u.pathname.replace(/^\/+/, "").split(/[/?#]/)[0];
        return user ? `https://t.me/${user}` : "https://t.me/";
      }
      return raw;
    } catch {
      return raw;
    }
  }

  const hostPath = raw.replace(/^\/+/, "");
  const tm = hostPath.match(/^(?:t\.me|telegram\.me|telegram\.dog)\/+(.+)$/i);
  if (tm) {
    const user = tm[1].replace(/^@/, "").split(/[/?#\s]/)[0];
    return user ? `https://t.me/${user}` : "";
  }

  const user = raw.replace(/^@/, "").split(/[/?#\s]/)[0];
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(user)) {
    return `https://t.me/${user}`;
  }

  return raw;
}
