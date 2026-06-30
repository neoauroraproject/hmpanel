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
}
