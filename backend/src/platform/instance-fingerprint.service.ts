import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';

@Injectable()
export class InstanceFingerprintService {
  getInstanceId(): string {
    const envId = process.env.HMPANEL_INSTANCE_ID?.trim();
    if (envId) return envId;

    const installPath = process.cwd();
    const hostname = os.hostname();
    const machineId = this.readMachineId();
    const raw = `${hostname}|${installPath}|${machineId}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  private readMachineId(): string {
    const paths = [
      '/etc/machine-id',
      '/var/lib/dbus/machine-id',
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf8').trim();
        }
      } catch {
        /* ignore */
      }
    }
    return 'unknown';
  }
}
