import { HttpException } from '@nestjs/common';
import { parsePort, readEnvValue, PortsService } from './ports.service';
import { buildHmArgs, HmctlClient } from './hmctl.client';

describe('parsePort', () => {
  it('accepts numbers and numeric strings in range', () => {
    expect(parsePort(8443)).toBe(8443);
    expect(parsePort(' 2096 ')).toBe(2096);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects everything else', () => {
    for (const v of [0, 65536, -1, 1.5, '', 'abc', '80;rm', '123456', null, undefined, {}]) {
      expect(parsePort(v)).toBeNull();
    }
  });
});

describe('readEnvValue', () => {
  it('reads the last assignment and strips quotes / CR', () => {
    const env = 'HTTP_PORT=80\r\nHTTPS_PORT="443"\r\nHTTP_PORT=8080\r\n';
    expect(readEnvValue(env, 'HTTP_PORT')).toBe('8080');
    expect(readEnvValue(env, 'HTTPS_PORT')).toBe('443');
    expect(readEnvValue(env, 'MISSING')).toBeNull();
  });
});

describe('buildHmArgs', () => {
  it('runs hm inside the host network namespace with args passed positionally', () => {
    const args = buildHmArgs('ports', 'set', ['8080', '8443', 'async'], undefined, true);
    expect(args.slice(0, 4)).toEqual(['exec', '-d', 'hmpanel-host-agent', 'chroot']);
    const i = args.indexOf('-c');
    expect(args[i + 1]).toContain('nsenter -t 1 -n -- "$@"');
    expect(args.slice(i + 2)).toEqual([
      'hm',
      '/usr/local/bin/hm',
      'ports',
      'set',
      '8080',
      '8443',
      'async',
      '--json',
    ]);
  });

  it('keeps OPERATION_ID for streamed SSL commands', () => {
    const args = buildHmArgs('ssl', 'renew', [], 'abc123');
    expect(args).toContain('OPERATION_ID=abc123');
    expect(args).not.toContain('-d');
  });
});

describe('PortsService.changePorts validation', () => {
  const hmctl = { execute: jest.fn(), executeDetached: jest.fn() } as unknown as HmctlClient;
  const svc = new PortsService(hmctl);

  it('rejects invalid or identical ports before touching the host', async () => {
    await expect(svc.changePorts('0', '443')).rejects.toBeInstanceOf(HttpException);
    await expect(svc.changePorts(8443, 8443)).rejects.toBeInstanceOf(HttpException);
    expect(hmctl.execute).not.toHaveBeenCalled();
    expect(hmctl.executeDetached).not.toHaveBeenCalled();
  });

  it('surfaces the host reason when ports are busy', async () => {
    (hmctl.execute as jest.Mock).mockRejectedValueOnce(
      new Error('HMCTL Error [PORTS_UNAVAILABLE]: {"success":false,"code":"PORTS_UNAVAILABLE","reason":"Port 8080 is already used by another service on this server."}'),
    );
    await expect(svc.changePorts(8080, 8443)).rejects.toThrow('Port 8080 is already used');
    expect(hmctl.executeDetached).not.toHaveBeenCalled();
  });
});
