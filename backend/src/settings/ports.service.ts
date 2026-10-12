import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { HmctlClient } from './hmctl.client';

const ENV_PATH = '/app/.env';
// ./nginx on the host; `hm ports set` writes its progress here.
const STATUS_PATH = '/app/nginx_host/.port-change.json';

export type PortChangeState =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'rolled_back'
  | 'failed';

export interface PortChangeStatus {
  state: PortChangeState;
  httpPort?: number;
  httpsPort?: number;
  previousHttpPort?: number;
  previousHttpsPort?: number;
  message?: string;
  updatedAt?: number;
}

export function parsePort(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,5}$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

export function readEnvValue(content: string, key: string): string | null {
  let found: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) {
      found = line
        .slice(key.length + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  return found;
}

@Injectable()
export class PortsService {
  private readonly logger = new Logger(PortsService.name);

  constructor(private readonly hmctl: HmctlClient) {}

  getPorts() {
    let env = '';
    try {
      env = fs.readFileSync(ENV_PATH, 'utf8');
    } catch {
      // Dev / non-docker: fall back to defaults.
    }
    return {
      httpPort: parsePort(readEnvValue(env, 'HTTP_PORT')) ?? 80,
      httpsPort: parsePort(readEnvValue(env, 'HTTPS_PORT')) ?? 443,
    };
  }

  getStatus(): PortChangeStatus {
    try {
      const raw = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
      if (raw && typeof raw.state === 'string') return raw as PortChangeStatus;
    } catch {
      // No change has been made yet.
    }
    return { state: 'idle' };
  }

  async changePorts(httpPortRaw: unknown, httpsPortRaw: unknown) {
    const httpPort = parsePort(httpPortRaw);
    const httpsPort = parsePort(httpsPortRaw);
    if (httpPort === null || httpsPort === null) {
      throw new HttpException(
        'Ports must be numbers between 1 and 65535.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (httpPort === httpsPort) {
      throw new HttpException(
        'HTTP and HTTPS ports must be different.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = this.getPorts();
    if (current.httpPort === httpPort && current.httpsPort === httpsPort) {
      return { scheduled: false, unchanged: true, httpPort, httpsPort };
    }

    const status = this.getStatus();
    if (
      (status.state === 'pending' || status.state === 'running') &&
      status.updatedAt &&
      Date.now() / 1000 - status.updatedAt < 180
    ) {
      throw new HttpException(
        'A port change is already in progress.',
        HttpStatus.CONFLICT,
      );
    }

    // Reject busy ports up front, while this request can still report it.
    try {
      await this.hmctl.execute(
        'ports',
        'check',
        [String(httpPort), String(httpsPort)],
        undefined,
        { timeoutMs: 30_000 },
      );
    } catch (err) {
      throw new HttpException(
        this.reasonFrom(err) || 'The selected ports are not available.',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.writeStatus({
      state: 'pending',
      httpPort,
      httpsPort,
      previousHttpPort: current.httpPort,
      previousHttpsPort: current.httpsPort,
      message: 'Scheduled',
      updatedAt: Math.floor(Date.now() / 1000),
    });

    // Recreating nginx cuts this very connection, so the host command runs
    // detached and waits a few seconds before touching nginx.
    try {
      await this.hmctl.executeDetached('ports', 'set', [
        String(httpPort),
        String(httpsPort),
        'async',
      ]);
    } catch (err) {
      this.writeStatus({
        state: 'failed',
        httpPort,
        httpsPort,
        previousHttpPort: current.httpPort,
        previousHttpsPort: current.httpsPort,
        message: (err as Error).message,
        updatedAt: Math.floor(Date.now() / 1000),
      });
      throw new HttpException(
        `Could not start the port change: ${(err as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(
      `Panel ports change scheduled: ${current.httpPort}/${current.httpsPort} -> ${httpPort}/${httpsPort}`,
    );
    return {
      scheduled: true,
      httpPort,
      httpsPort,
      previousHttpPort: current.httpPort,
      previousHttpsPort: current.httpsPort,
    };
  }

  private writeStatus(status: PortChangeStatus) {
    try {
      fs.writeFileSync(STATUS_PATH, JSON.stringify(status));
    } catch (err) {
      this.logger.warn(
        `Could not write ${STATUS_PATH}: ${(err as Error).message}`,
      );
    }
  }

  private reasonFrom(err: unknown): string | null {
    const msg = (err as Error)?.message || '';
    const m = msg.match(/\{.*\}$/s);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (typeof parsed.reason === 'string') return parsed.reason;
      } catch {
        // not JSON
      }
    }
    return msg || null;
  }
}
