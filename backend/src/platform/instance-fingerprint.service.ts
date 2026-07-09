import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const INSTANCE_ID_FILE = '.hmpanel-instance-id';

@Injectable()
export class InstanceFingerprintService {
  getInstanceId(): string {
    const envId = process.env.HMPANEL_INSTANCE_ID?.trim();
    if (envId) return envId;

    const persisted = this.readPersistedId();
    if (persisted) return persisted;

    const generated = this.computeFingerprint();
    this.persistId(generated);
    return generated;
  }

  private computeFingerprint(): string {
    const installPath = process.cwd();
    const hostname = os.hostname();
    const machineId = this.readMachineId();
    const raw = `${hostname}|${installPath}|${machineId}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  private idFileCandidates(): string[] {
    return [
      process.env.HMPANEL_INSTANCE_ID_FILE,
      path.join('/app/backups', INSTANCE_ID_FILE),
      path.join(process.cwd(), 'backups', INSTANCE_ID_FILE),
      path.join(os.tmpdir(), INSTANCE_ID_FILE),
    ].filter((v): v is string => Boolean(v?.trim()));
  }

  private readPersistedId(): string | null {
    for (const file of this.idFileCandidates()) {
      try {
        if (fs.existsSync(file)) {
          const id = fs.readFileSync(file, 'utf8').trim();
          if (id.length >= 16) return id;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  }

  private persistId(id: string): void {
    for (const file of this.idFileCandidates()) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, id, 'utf8');
        return;
      } catch {
        /* try next */
      }
    }
  }

  private readMachineId(): string {
    const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
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
