import { deflateSync } from 'zlib';

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (~c) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function rgbaPng(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
) {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const o = 1 + x * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = a;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
}

/** 3×5 pixel glyphs for digits, compact suffixes, and decimal point. */
const GLYPH: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  K: ['101', '110', '100', '110', '101'],
  M: ['101', '111', '101', '101', '101'],
  ' ': ['000', '000', '000', '000', '000'],
};

function glyphHit(px: number, py: number, originX: number, originY: number, text: string, scale: number) {
  let ox = originX;
  for (const ch of text) {
    const rows = GLYPH[ch] || GLYPH[ch.toUpperCase()];
    if (!rows) {
      ox += 4 * scale;
      continue;
    }
    const lx = Math.floor((px - ox) / scale);
    const ly = Math.floor((py - originY) / scale);
    if (lx >= 0 && lx < 3 && ly >= 0 && ly < 5 && rows[ly][lx] === '1') return true;
    ox += 4 * scale;
  }
  return false;
}

const GREG_MONTHS_FA = [
  'ژان',
  'فور',
  'مار',
  'آور',
  'مه',
  'ژون',
  'ژوی',
  'اوت',
  'سپت',
  'اکت',
  'نوا',
  'دسا',
];

/** Compact ASCII labels that fit the 3×5 glyph set. */
export function formatCompactRevenue(n: number): string {
  const abs = Math.abs(Number(n) || 0);
  const trim = (value: string) => value.replace(/\.0$/, '');
  if (abs >= 1_000_000) return `${trim((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${trim((abs / 1000).toFixed(1))}K`;
  return String(Math.round(abs));
}

function textWidth(text: string, scale: number) {
  return text.length * 4 * scale;
}

/** Yearly bar chart PNG (toman preferred if store currency is not USD). */
export function renderYearlyRevenueChartPng(input: {
  year: number;
  months: Array<{ month: number; toman: number; usd: number }>;
  preferToman: boolean;
  yearTotal?: number;
}): string {
  const w = 720;
  const h = 400;
  const padL = 78;
  const padR = 20;
  const padT = 58;
  const padB = 52;
  const values = input.months.map((m) => (input.preferToman ? m.toman : m.usd));
  const yearTotal =
    input.yearTotal ?? values.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const max = Math.max(1, ...values);
  const slot = (w - padL - padR) / 12;
  const barW = Math.max(10, Math.floor(slot) - 10);

  const bg: [number, number, number, number] = [15, 23, 42, 255];
  const panel: [number, number, number, number] = [30, 41, 59, 255];
  const bar: [number, number, number, number] = [20, 184, 166, 255];
  const axis: [number, number, number, number] = [148, 163, 184, 255];
  const title: [number, number, number, number] = [226, 232, 240, 255];
  const label: [number, number, number, number] = [203, 213, 225, 255];

  const yearLabel = `${input.year} ${formatCompactRevenue(yearTotal)}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    p,
    text: formatCompactRevenue(max * p),
  }));

  return rgbaPng(w, h, (x, y) => {
    if (x < 8 || y < 8 || x >= w - 8 || y >= h - 8) return bg;
    if (y >= 14 && y < 14 + 12 && glyphHit(x, y, 24, 16, yearLabel, 2)) return title;
    const plotH = h - padT - padB;
    if (y > padT && y < h - padB && x > padL && x < w - padR) {
      const gy = (y - padT) / plotH;
      if (Math.abs((1 - gy) * 4 - Math.round((1 - gy) * 4)) < 0.02) return axis;
    }
    for (const tick of yTicks) {
      const ty = Math.round(h - padB - tick.p * plotH) - 4;
      const tw = textWidth(tick.text, 1);
      if (glyphHit(x, y, padL - 8 - tw, ty, tick.text, 1)) return axis;
    }
    for (let i = 0; i < 12; i++) {
      const bx = padL + 8 + i * slot;
      const v = values[i] || 0;
      const bh = Math.round((v / max) * (plotH - 16));
      const top = h - padB - bh;
      if (x >= bx && x < bx + barW && y >= top && y < h - padB) return bar;
      if (v > 0) {
        const amount = formatCompactRevenue(v);
        const scale = amount.length > 4 ? 1 : 2;
        const lx = Math.floor(bx + barW / 2 - textWidth(amount, scale) / 2);
        const ly = Math.max(padT + 2, top - 12);
        if (glyphHit(x, y, lx, ly, amount, scale)) return label;
      }
      const month = String(i + 1);
      const mx = Math.floor(bx + barW / 2 - textWidth(month, 2) / 2);
      if (glyphHit(x, y, mx, h - 32, month, 2)) return axis;
      if (y >= h - padB + 4 && y < h - 36 && x >= bx && x < bx + barW) return panel;
    }
    return bg;
  });
}

export function formatMonthTable(
  months: Array<{ month: number; toman: number; usd: number; orders: number }>,
  formatMoney: (n: number, c: 'usd' | 'toman') => string,
  preferToman = true,
) {
  return months
    .map((m) => {
      const name = GREG_MONTHS_FA[m.month - 1] || String(m.month);
      const primary = preferToman
        ? formatMoney(m.toman, 'toman')
        : formatMoney(m.usd, 'usd');
      const otherN = preferToman ? m.usd : m.toman;
      const other = preferToman
        ? formatMoney(m.usd, 'usd')
        : formatMoney(m.toman, 'toman');
      return otherN > 0
        ? `${name}: ${primary} · ${other} (${m.orders})`
        : `${name}: ${primary} (${m.orders})`;
    })
    .join('\n');
}
