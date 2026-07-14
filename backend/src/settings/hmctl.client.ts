import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { Observable } from 'rxjs';

export interface HmctlEvent {
  type: 'progress' | 'complete' | 'error';
  message?: string;
  data?: unknown;
  error?: {
    message?: string;
    reason?: string;
    code?: number | string;
    stdout?: string;
  };
}

interface HmctlResponse {
  success: boolean;
  code?: string;
  log?: string;
  data?: any;
  [key: string]: unknown;
}

@Injectable()
export class HmctlClient {
  private readonly logger = new Logger(HmctlClient.name);

  /**
   * Executes a command on the host via the privileged host-agent container.
   * Uses spawn (not shell) — same arg-safe path as SSL Manager streaming —
   * so large PEM/base64 args for custom domains survive.
   */
  async execute(
    module: string,
    action: string,
    args: string[] = [],
    opId?: string,
    opts?: { timeoutMs?: number },
  ): Promise<HmctlResponse> {
    const timeoutMs = opts?.timeoutMs ?? 600_000;
    this.logger.log(`Executing HMCTL: hm ${module} ${action} --json`);

    const childArgs = ['exec'];
    if (opId) {
      childArgs.push('-e', `OPERATION_ID=${opId}`);
    }
    childArgs.push('hmpanel-host-agent', 'chroot', '/host');
    if (opId) {
      childArgs.push('env', `OPERATION_ID=${opId}`);
    }
    childArgs.push('/usr/local/bin/hm', module, action, ...args, '--json');

    return new Promise((resolve, reject) => {
      const child = spawn('docker', childArgs);
      let stdoutData = '';
      let stderrData = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(
          new Error(
            `HMCTL timed out after ${Math.round(timeoutMs / 1000)}s (hm ${module} ${action})`,
          ),
        );
      }, timeoutMs);

      child.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      child.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.logger.error(`HMCTL spawn failed: ${err.message}`);
        reject(new Error(`Host command failed: ${err.message}`));
      });

      child.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const parsed = this.parseJsonOutput(stdoutData);
        if (parsed) {
          if (!parsed.success && parsed.code) {
            reject(
              new Error(
                `HMCTL Error [${parsed.code}]: ${JSON.stringify(parsed)}`,
              ),
            );
            return;
          }
          if (code && code !== 0 && !parsed.success) {
            reject(
              new Error(
                `HMCTL Error [${parsed.code || code}]: ${JSON.stringify(parsed)}`,
              ),
            );
            return;
          }
          resolve(parsed);
          return;
        }

        const hint = (stderrData || stdoutData).trim().slice(-800);
        this.logger.error(
          `HMCTL failed (exit ${code}): ${hint || 'no output'}`,
        );
        reject(
          new Error(
            `Host command failed: exit ${code}${hint ? ` — ${hint}` : ''}`,
          ),
        );
      });
    });
  }

  /** Last JSON object in stdout (PROGRESS goes to stderr). */
  private parseJsonOutput(stdout: string): HmctlResponse | null {
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as HmctlResponse;
    } catch {
      // Fall through: sometimes unrelated lines appear before the JSON blob
    }
    const start = trimmed.lastIndexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as HmctlResponse;
      } catch {
        return null;
      }
    }
    return null;
  }

  executeStream(
    module: string,
    action: string,
    args: string[] = [],
    opId?: string,
  ): Observable<HmctlEvent> {
    return new Observable<HmctlEvent>((subscriber) => {
      const logPrefix = opId ? `[SSL][${opId}] ` : '';
      this.logger.log(
        `${logPrefix}Executing HMCTL (Stream): hm ${module} ${action} --json`,
      );

      const childArgs = ['exec'];
      if (opId) {
        childArgs.push('-e', `OPERATION_ID=${opId}`);
      }
      childArgs.push('hmpanel-host-agent', 'chroot', '/host');
      if (opId) {
        childArgs.push('env', `OPERATION_ID=${opId}`);
      }
      childArgs.push('/usr/local/bin/hm', module, action, ...args, '--json');

      const child = spawn('docker', childArgs);

      let stdoutData = '';

      child.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes('PROGRESS:')) {
            const progressMsg = line.split('PROGRESS:')[1].trim();
            subscriber.next({ type: 'progress', message: progressMsg });
          }
        }
      });

      child.on('close', (code: number) => {
        try {
          if (stdoutData.trim()) {
            const jsonOutput =
              this.parseJsonOutput(stdoutData) ||
              (JSON.parse(stdoutData) as HmctlResponse);
            if (!jsonOutput.success && jsonOutput.code) {
              subscriber.next({ type: 'error', error: jsonOutput });
            } else {
              subscriber.next({ type: 'complete', data: jsonOutput });
            }
          } else {
            subscriber.next({
              type: 'error',
              error: { message: 'No output from HMCTL', code },
            });
          }
        } catch (e: any) {
          const parseMsg = e instanceof Error ? e.message : String(e);
          subscriber.next({
            type: 'error',
            error: {
              message: `Failed to parse JSON: ${parseMsg}`,
              stdout: stdoutData,
            },
          });
        }
        subscriber.complete();
      });

      child.on('error', (err: Error) => {
        subscriber.next({ type: 'error', error: { message: err.message } });
        subscriber.complete();
      });
    });
  }
}
