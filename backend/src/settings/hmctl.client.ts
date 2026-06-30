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
  async execute(module: string, action: string, args: string[] = []): Promise<{ stdout: string; stderr: string }> {
    // Escape arguments to prevent injection
    const escapedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
    const cmd = `docker exec hmpanel-host-agent chroot /host /usr/local/bin/hm ${module} ${action} ${escapedArgs}`;
    
    this.logger.log(`Executing HMCTL: hm ${module} ${action}`);
    
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return { stdout, stderr };
    } catch (error) {
      this.logger.error(`HMCTL command failed: ${error.message}`);
      throw new Error(`Host command failed: ${error.message}`);
    }
  }
}
