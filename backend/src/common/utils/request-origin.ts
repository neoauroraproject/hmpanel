import type { Request } from 'express';

/** Public origin for subscription links behind reverse proxy. */
export function getRequestOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https')
    .split(',')[0]
    .trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}
