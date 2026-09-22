/**
 * Extract share URIs from a 3x-ui custom subscription HTML page.
 *
 * Custom templates inject `{{ range .links }}` into hidden `.raw-link` nodes
 * (see MHSanaei/3x-ui docs/custom-subscription-templates.md). Those strings are
 * the Hosts-aware configs shown on the native page — not the client base64 feed,
 * which may stamp a different subscription/CDN host.
 */

const PROTOCOL_URI =
  /(?:vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic|wireguard|wg):\/\/[^\s"'<>]+/gi;

function decodeHtmlEntities(raw: string): string {
  return String(raw || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function cleanUriCandidate(raw: string): string {
  let s = decodeHtmlEntities(String(raw || '').trim());
  // Strip trailing punctuation accidentally captured from HTML.
  s = s.replace(/&amp;/gi, '&').replace(/[),.;]+$/g, '');
  return s.trim();
}

function isShareUri(line: string): boolean {
  return /^[a-z0-9+.-]+:\/\//i.test(line);
}

/** Prefer explicit `.raw-link` nodes from neo / custom themes. */
export function extractRawLinkUrisFromHtml(html: string): string[] {
  const text = String(html || '');
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const rawLinkRe =
    /<(?:div|span)[^>]*\bclass=["'][^"']*\braw-link\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/gi;
  let m: RegExpExecArray | null;
  while ((m = rawLinkRe.exec(text)) !== null) {
    const inner = cleanUriCandidate(m[1].replace(/<[^>]+>/g, ' '));
    if (!isShareUri(inner) || seen.has(inner)) continue;
    seen.add(inner);
    out.push(inner);
  }
  if (out.length) return out;

  // Fallback: any protocol URI embedded in the HTML body.
  const matches = text.match(PROTOCOL_URI) || [];
  for (const raw of matches) {
    const uri = cleanUriCandidate(raw);
    if (!isShareUri(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }
  return out;
}

export function looksLikeSubscriptionHtml(body: string): boolean {
  const s = String(body || '');
  return (
    /raw-link/i.test(s) ||
    (/<!doctype html/i.test(s) && /vless:\/\/|vmess:\/\//i.test(s)) ||
    (/<html[\s>]/i.test(s) && /configs-container|raw-links-container/i.test(s))
  );
}
