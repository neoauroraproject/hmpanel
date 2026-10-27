import * as fs from 'fs';

jest.mock('fs');

const readFileSync = fs.readFileSync as unknown as jest.Mock;

function load(env: string) {
  readFileSync.mockReturnValue(env);
  let mod: typeof import('./panel-port.util');
  jest.isolateModules(() => {
    mod = require('./panel-port.util');
  });
  return mod!;
}

describe('panel public URL (live .env)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('adds the custom HTTPS port from .env', () => {
    const u = load('DOMAIN=panel.example.com\nPANEL_DOMAIN=panel.example.com\nHTTP_PORT=8080\nHTTPS_PORT=8443\n');
    expect(u.panelPublicOrigin()).toBe('https://panel.example.com:8443');
    expect(u.panelPortSuffix('http')).toBe(':8080');
  });

  it('omits default ports', () => {
    const u = load('PANEL_DOMAIN=panel.example.com\nHTTP_PORT=80\nHTTPS_PORT=443\n');
    expect(u.panelPublicOrigin()).toBe('https://panel.example.com');
  });

  it('prefers the live .env domain over the stale container env (install-time IP)', () => {
    process.env.PANEL_DOMAIN = '203.0.113.7';
    process.env.DOMAIN = '203.0.113.7';
    const u = load('PANEL_DOMAIN="panel.example.com"\nHTTPS_PORT=2053\n');
    expect(u.panelPublicHost()).toBe('panel.example.com');
    expect(u.panelPublicOrigin()).toBe('https://panel.example.com:2053');
  });

  it('uses a custom domain with the same nginx port', () => {
    const u = load('PANEL_DOMAIN=panel.example.com\nHTTPS_PORT=8443\n');
    expect(u.panelPublicOrigin('Shop.Example.org:443')).toBe('https://shop.example.org:8443');
  });

  it('falls back to process.env when .env is unreadable', () => {
    process.env.PANEL_DOMAIN = 'fallback.example.com';
    process.env.HTTPS_PORT = '8443';
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    let u: typeof import('./panel-port.util');
    jest.isolateModules(() => {
      u = require('./panel-port.util');
    });
    expect(u!.panelPublicOrigin()).toBe('https://fallback.example.com:8443');
  });

  it('respects FORCE_HTTP with the HTTP port', () => {
    process.env.FORCE_HTTP = 'true';
    const u = load('PANEL_DOMAIN=panel.example.com\nHTTP_PORT=8080\n');
    expect(u.panelPublicOrigin()).toBe('http://panel.example.com:8080');
  });
});
