import { Injectable, Logger } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Observable } from 'rxjs';

const execAsync = promisify(exec);

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
}

@Injectable()
export class HmctlClient {
  private readonly logger = new Logger(HmctlClient.name);

  /**
   * Executes a command on the host via the reusable privileged host-agent container.
   * This abstraction ensures that the backend API is decoupled from the execution mechanism
   * (e.g., can be swapped to Unix Socket or Named Pipe later).
   */
  async execute(
    module: string,
    action: string,
    args: string[] = [],
    opId?: string,
  ): Promise<any> {
    // Escape arguments to prevent injection
    const escapedArgs = args
      .map((arg) => `"${arg.replace(/"/g, '\\"')}"`)
      .join(' ');
    const envPrefix = opId ? `env OPERATION_ID=${opId} ` : '';
    // Always append --json for programmatic execution
    const cmd = `docker exec hmpanel-host-agent chroot /host ${envPrefix}/usr/local/bin/hm ${module} ${action} ${escapedArgs} --json`;

    this.logger.log(`Executing HMCTL: hm ${module} ${action} --json`);

    try {
      const { stdout } = await execAsync(cmd);
      try {
        const jsonOutput = JSON.parse(stdout) as HmctlResponse;
        if (!jsonOutput.success && jsonOutput.code) {
          throw new Error(
            `HMCTL Error [${jsonOutput.code}]: ${JSON.stringify(jsonOutput)}`,
          );
        }
        return jsonOutput;
      } catch (parseError: any) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        if (parseMsg.includes('HMCTL Error')) throw parseError;
        this.logger.error(`Failed to parse HMCTL JSON output: ${stdout}`);
        throw new Error(`Failed to parse host response: ${parseMsg}`);
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`HMCTL command failed: ${errMsg}`);
      throw new Error(`Host command failed: ${errMsg}`);
    }
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
            const jsonOutput = JSON.parse(stdoutData) as HmctlResponse;
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
