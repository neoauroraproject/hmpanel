import * as http from 'http';
import type { AddressInfo } from 'net';
import axios from 'axios';
import {
  localRouteCandidates,
  normalizeLocalOrigin,
  originalHostHeader,
  rewriteToLocal,
} from './panel-local-route.util';
import { PanelConnectionProxyService } from './panel-connection-proxy.service';

describe('panel local route helpers', () => {
  it('keeps only the origin of a local URL', () => {
    expect(normalizeLocalOrigin('http://host.docker.internal:2053/abc/panel')).toBe('http://host.docker.internal:2053');
    expect(normalizeLocalOrigin('127.0.0.1:2053')).toBe('http://127.0.0.1:2053');
    expect(normalizeLocalOrigin('')).toBeNull();
    expect(normalizeLocalOrigin('ftp://x')).toBeNull();
  });

  it('tries every local host on the same port, saved scheme first', () => {
    const c = localRouteCandidates('https://panel.example.com:2053/base/panel', ['host.docker.internal', '127.0.0.1']);
    expect(c).toEqual([
      'https://host.docker.internal:2053',
      'http://host.docker.internal:2053',
      'https://127.0.0.1:2053',
      'http://127.0.0.1:2053',
    ]);
    expect(localRouteCandidates('https://panel.example.com/x', ['h'])[0]).toBe('https://h:443');
  });

  it('swaps only the origin and keeps the original Host', () => {
    const url = 'https://panel.example.com:2053/base/panel/api/inbounds/list?x=1';
    expect(rewriteToLocal(url, 'http://127.0.0.1:2053')).toBe('http://127.0.0.1:2053/base/panel/api/inbounds/list?x=1');
    expect(originalHostHeader(url)).toBe('panel.example.com:2053');
  });
});

describe('PanelConnectionProxyService local route', () => {
  let server: http.Server;
  let port = 0;
  const seen: Array<{ host?: string; url?: string }> = [];
  let svc: PanelConnectionProxyService;
  let localUrl: string | null = null;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: req.headers.authorization === 'Bearer tok', obj: {} }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
    const prisma = {
      panel: {
        findMany: jest.fn(async (args: any) =>
          args?.where?.localUrl
            ? localUrl
              ? [{ url: `http://panel.invalid:${port}/base`, localUrl, name: 'p1' }]
              : []
            : [{ url: `http://panel.invalid:${port}/base` }],
        ),
      },
    };
    const settings = { getSetting: jest.fn(async () => null) };
    svc = new PanelConnectionProxyService(prisma as any, settings as any);
    svc.onModuleInit();
  });

  afterAll(async () => {
    svc.onModuleDestroy();
    await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(() => {
    seen.length = 0;
    svc.invalidate();
  });

  it('sends panel calls to the local address with the real Host header', async () => {
    localUrl = `http://127.0.0.1:${port}`;
    const res = await axios.get(`http://panel.invalid:${port}/base/panel/api/server/status`, {
      headers: { Authorization: 'Bearer tok' },
    });
    expect(res.data.success).toBe(true);
    expect(seen[0]).toEqual({ host: `panel.invalid:${port}`, url: '/base/panel/api/server/status' });
  });

  it('falls back to the saved URL when the local address is down', async () => {
    localUrl = 'http://127.0.0.1:1'; // nothing listens there
    // The saved host does not resolve either, so the call fails — but only after
    // trying the saved URL, which shows the fallback happened.
    await expect(axios.get(`http://panel.invalid:${port}/base/x`, { timeout: 3000 })).rejects.toMatchObject({
      config: expect.objectContaining({ __panelLocal: 'fallback' }),
    });
  });

  it('detects the panel on a local address only when the token works', async () => {
    const found = await svc.detectLocalRoute(
      { url: `http://panel.invalid:${port}/base`, apiToken: 'tok' },
      [`http://127.0.0.1:${port}`, 'http://127.0.0.1:1'],
    );
    expect(found.best).toBe(`http://127.0.0.1:${port}`);
    const wrong = await svc.detectLocalRoute({ url: `http://panel.invalid:${port}/base`, apiToken: 'bad' }, [
      `http://127.0.0.1:${port}`,
    ]);
    expect(wrong.best).toBeNull();
  });
});
