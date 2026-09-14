/** Parse 3x-ui online-client / client-IP payloads (shape varies by version). */

export function extractOnlineEmails(obj: unknown): string[] {
  const rows = collectEmailRows(obj);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const email = String(raw || '')
      .trim()
      .toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function extractOnlineIpCounts(obj: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  const root = unwrapObj(obj);
  if (root == null) return result;

  if (Array.isArray(root)) {
    for (const row of root) {
      if (row == null) continue;
      if (typeof row === 'string') continue;
      if (typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const email = String(rec.email || rec.clientEmail || rec.id || '')
        .trim()
        .toLowerCase();
      if (!email) continue;
      result[email] = (result[email] || 0) + countIps(rec.ips ?? rec.ip ?? rec.clientIps ?? rec);
    }
    return result;
  }

  if (typeof root === 'object') {
    for (const [emailRaw, value] of Object.entries(root as Record<string, unknown>)) {
      const email = String(emailRaw || '')
        .trim()
        .toLowerCase();
      if (!email || email === 'success' || email === 'msg') continue;
      const n = countIps(value);
      if (n <= 0) continue;
      result[email] = (result[email] || 0) + n;
    }
  }
  return result;
}

function unwrapObj(obj: unknown): unknown {
  if (obj == null) return null;
  if (typeof obj !== 'object') return obj;
  const rec = obj as Record<string, unknown>;
  if ('obj' in rec && rec.obj != null && rec.obj !== obj) return unwrapObj(rec.obj);
  if (Array.isArray(rec.list)) return rec.list;
  if (Array.isArray(rec.emails)) return rec.emails;
  if (Array.isArray(rec.ips) && !looksLikeEmailMap(rec)) return rec.ips;
  return obj;
}

function looksLikeEmailMap(rec: Record<string, unknown>): boolean {
  return Object.keys(rec).some((k) => k.includes('@') || k.includes('_'));
}

function collectEmailRows(obj: unknown): unknown[] {
  const root = unwrapObj(obj);
  if (Array.isArray(root)) {
    return root.map((row) => {
      if (typeof row === 'string') return row;
      if (row && typeof row === 'object') {
        const rec = row as Record<string, unknown>;
        return rec.email ?? rec.clientEmail ?? rec.id ?? '';
      }
      return '';
    });
  }
  return [];
}

function countIps(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parts = value
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length;
  }
  if (Array.isArray(value)) {
    return value.filter((v) => v != null && String(v).trim() !== '').length;
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (rec.ips != null) return countIps(rec.ips);
    if (rec.ip != null) return countIps(rec.ip);
    if (typeof rec.count === 'number') return countIps(rec.count);
  }
  return 0;
}
