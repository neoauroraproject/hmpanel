/** Parse 3x-ui online-client / client-IP payloads (shape varies by version). */

export type OnlineSession = {
  ip: string;
  device?: string | null;
  hwid?: string | null;
};

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
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.count === 'number' && rec.ips == null && rec.ip == null) {
      return Math.max(0, Math.floor(rec.count));
    }
  }
  return listSessions(value).length;
}

/** Extract per-email online sessions (IP + optional device/hwid). */
export function extractOnlineIpDetails(
  obj: unknown,
): Record<string, OnlineSession[]> {
  const result: Record<string, OnlineSession[]> = {};
  const root = unwrapObj(obj);
  if (root == null) return result;

  const push = (emailRaw: string, sessions: OnlineSession[]) => {
    const email = String(emailRaw || '')
      .trim()
      .toLowerCase();
    if (!email || email === 'success' || email === 'msg' || !sessions.length) {
      return;
    }
    const prev = result[email] ?? [];
    const seen = new Set(prev.map((s) => s.ip));
    for (const s of sessions) {
      if (!s.ip || seen.has(s.ip)) continue;
      seen.add(s.ip);
      prev.push(s);
    }
    result[email] = prev;
  };

  if (Array.isArray(root)) {
    for (const row of root) {
      if (row == null || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const email = String(rec.email || rec.clientEmail || rec.id || '');
      push(email, listSessions(rec.ips ?? rec.ip ?? rec.clientIps ?? rec));
    }
    return result;
  }

  if (typeof root === 'object') {
    for (const [emailRaw, value] of Object.entries(
      root as Record<string, unknown>,
    )) {
      push(emailRaw, listSessions(value));
    }
  }
  return result;
}

/** Parse HWID / device list payloads from 3x-ui hwids API. */
export function extractHwidDevices(obj: unknown): Array<{
  hwid?: string | null;
  device?: string | null;
  ip?: string | null;
}> {
  const root = unwrapObj(obj);
  const rows = Array.isArray(root)
    ? root
    : root && typeof root === 'object' && Array.isArray((root as any).list)
      ? (root as any).list
      : root && typeof root === 'object'
        ? Object.values(root as Record<string, unknown>)
        : [];

  const out: Array<{ hwid?: string | null; device?: string | null; ip?: string | null }> =
    [];
  for (const row of rows) {
    if (row == null) continue;
    if (typeof row === 'string') {
      const s = row.trim();
      if (s) out.push({ hwid: s, device: null, ip: null });
      continue;
    }
    if (typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const hwid = String(rec.hwid || rec.id || rec.deviceId || '').trim() || null;
    const device =
      String(
        rec.device ||
          rec.deviceName ||
          rec.platform ||
          rec.os ||
          rec.userAgent ||
          rec.ua ||
          '',
      ).trim() || null;
    const ip = String(rec.ip || rec.clientIp || rec.addr || '').trim() || null;
    if (hwid || device || ip) out.push({ hwid, device, ip });
  }
  return out;
}

function listSessions(value: unknown): OnlineSession[] {
  if (value == null) return [];
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Bare count — no IP addresses available.
    return [];
  }
  if (typeof value === 'string') {
    return value
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((ip) => ({ ip, device: null, hwid: null }));
  }
  if (Array.isArray(value)) {
    const out: OnlineSession[] = [];
    for (const item of value) {
      if (item == null) continue;
      if (typeof item === 'string' || typeof item === 'number') {
        const ip = String(item).trim();
        if (ip) out.push({ ip, device: null, hwid: null });
        continue;
      }
      if (typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const ip = String(
          rec.ip || rec.clientIp || rec.addr || rec.address || '',
        ).trim();
        if (!ip) continue;
        const device =
          String(
            rec.device ||
              rec.deviceName ||
              rec.platform ||
              rec.os ||
              rec.userAgent ||
              rec.ua ||
              '',
          ).trim() || null;
        const hwid =
          String(rec.hwid || rec.deviceId || rec.id || '').trim() || null;
        out.push({ ip, device, hwid });
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (rec.ips != null) return listSessions(rec.ips);
    if (rec.ip != null) return listSessions(rec.ip);
    if (rec.clientIps != null) return listSessions(rec.clientIps);
  }
  return [];
}
