import { createHash } from 'crypto';

/** 3x-ui returns inbound settings as a JSON string (older builds: object). */
export function parseInboundJson(raw: unknown): any {
  if (typeof raw === 'string') return JSON.parse(raw || '{}');
  return raw || {};
}

/**
 * Cheap identity of an inbound as the panel reported it. Hashes the raw
 * settings strings instead of parsing them, so an unchanged inbound costs one
 * native hash rather than a parse plus a normalized deep compare.
 */
export function inboundFingerprint(
  apiInbound: { settings?: unknown; streamSettings?: unknown },
  fields: unknown[],
): string {
  return createHash('sha1')
    .update(rawJsonText(apiInbound.settings))
    .update('\u0000')
    .update(rawJsonText(apiInbound.streamSettings))
    .update('\u0000')
    .update(JSON.stringify(fields))
    .digest('base64');
}

function rawJsonText(value: unknown): string {
  if (typeof value === 'string') return value;
  return value == null ? '' : JSON.stringify(value);
}

/** Split an array into fixed-size chunks for batched DB work. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Stable JSON equality for sync diffs. Ignores `generatedAt` so connectionExtras
 * envelopes that only refreshed their timestamp do not force a DB write.
 */
export function syncJsonEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForCompare(value));
}

function normalizeForCompare(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'generatedAt') continue;
    out[key] = normalizeForCompare(obj[key]);
  }
  return out;
}

/** True when inbound row fields that sync cares about actually changed. */
export function inboundSyncFieldsChanged(
  existing: {
    panelInboundId: number | null;
    tag: string;
    remark: string | null;
    port: number;
    protocol: string;
    settings: unknown;
    streamSettings: unknown;
    nodeId: number | null;
    nodeName: string | null;
    originNodeGuid: string | null;
  },
  next: {
    panelInboundId: number | null;
    tag: string;
    remark: string | null;
    port: number;
    protocol: string;
    settings: unknown;
    streamSettings: unknown;
    nodeId: number | null;
    nodeName: string | null;
    originNodeGuid: string | null;
  },
): boolean {
  return (
    existing.panelInboundId !== next.panelInboundId ||
    existing.tag !== next.tag ||
    existing.remark !== next.remark ||
    existing.port !== next.port ||
    existing.protocol !== next.protocol ||
    existing.nodeId !== next.nodeId ||
    existing.nodeName !== next.nodeName ||
    existing.originNodeGuid !== next.originNodeGuid ||
    !syncJsonEqual(existing.settings, next.settings) ||
    !syncJsonEqual(existing.streamSettings, next.streamSettings)
  );
}
