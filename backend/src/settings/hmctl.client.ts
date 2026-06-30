import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class HmctlClient {
  private readonly logger = new Logger(HmctlClient.name);

  /**
   * Executes a command on the host via the reusable privileged host-agent container.
   * This abstraction ensures that the backend API is decoupled from the execution mechanism
   * (e.g., can be swapped to Unix Socket or Named Pipe later).
   */
  async execute(module: string, action: string, args: string[] = []): Promise<any> {
    // Escape arguments to prevent injection
    const escapedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
    // Always append --json for programmatic execution
    const cmd = `docker exec hmpanel-host-agent chroot /host /usr/local/bin/hm ${module} ${action} ${escapedArgs} --json`;
    
    this.logger.log(`Executing HMCTL: hm ${module} ${action} --json`);
    
    try {
      const { stdout } = await execAsync(cmd);
      try {
        const jsonOutput = JSON.parse(stdout);
        if (!jsonOutput.success && jsonOutput.code) {
          throw new Error(`HMCTL Error [${jsonOutput.code}]: ${JSON.stringify(jsonOutput)}`);
        }
        return jsonOutput;
      } catch (parseError) {
        if (parseError.message.includes('HMCTL Error')) throw parseError;
        this.logger.error(`Failed to parse HMCTL JSON output: ${stdout}`);
        throw new Error(`Failed to parse host response: ${parseError.message}`);
      }
    } catch (error) {
      this.logger.error(`HMCTL command failed: ${error.message}`);
      throw new Error(`Host command failed: ${error.message}`);
    }
  }

  executeStream(module: string, action: string, args: string[] = []): import('rxjs').Observable<any> {
    const { spawn } = require('child_process');
    const { Observable } = require('rxjs');
    return new Observable((subscriber: any) => {
      this.logger.log(`Executing HMCTL (Stream): hm ${module} ${action} --json`);
      
      const childArgs = ['exec', 'hmpanel-host-agent', 'chroot', '/host', '/usr/local/bin/hm', module, action, ...args, '--json'];
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
            const jsonOutput = JSON.parse(stdoutData);
            if (!jsonOutput.success && jsonOutput.code) {
               subscriber.next({ type: 'error', error: jsonOutput });
            } else {
               subscriber.next({ type: 'complete', data: jsonOutput });
            }
          } else {
             subscriber.next({ type: 'error', error: { message: 'No output from HMCTL', code } });
          }
        } catch (e) {
           subscriber.next({ type: 'error', error: { message: 'Failed to parse JSON', stdout: stdoutData } });
        }
        subscriber.complete();
      });
      
      child.on('error', (err: any) => {
        subscriber.next({ type: 'error', error: { message: err.message } });
        subscriber.complete();
      });
    });
  }
}
