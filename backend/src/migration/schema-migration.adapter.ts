/**
 * Additive schema migration adapter: backup / live schema version N → N+1.
 * Individual migrate-from-vX steps must be idempotent. Never drop operational columns here.
 */

export interface SchemaVersionSnapshot {
  version: number;
  label: string;
}

export interface MigrationStep {
  from: number;
  to: number;
  id: string;
  description: string;
  run: (ctx: MigrationContext) => Promise<void> | void;
}

export interface MigrationContext {
  from: number;
  to: number;
  dryRun: boolean;
  log: (msg: string) => void;
}

export const CURRENT_SCHEMA_VERSION = 1;

export class SchemaMigrationAdapter {
  constructor(private readonly steps: MigrationStep[] = []) {}

  currentVersion(): number {
    return CURRENT_SCHEMA_VERSION;
  }

  plan(from: number, to: number = CURRENT_SCHEMA_VERSION): MigrationStep[] {
    if (from === to) return [];
    if (from > to) {
      throw new Error(
        `Downgrade ${from} → ${to} is not supported; restore a matching backup instead`,
      );
    }
    const ordered = this.steps
      .filter((s) => s.from >= from && s.to <= to)
      .sort((a, b) => a.from - b.from || a.to - b.to);
    const needed: MigrationStep[] = [];
    let cursor = from;
    for (const step of ordered) {
      if (step.from === cursor && step.to > cursor) {
        needed.push(step);
        cursor = step.to;
      }
    }
    if (cursor !== to) {
      throw new Error(
        `No complete migration path from v${from} to v${to} (stopped at v${cursor})`,
      );
    }
    return needed;
  }

  async migrate(
    from: number,
    to: number = CURRENT_SCHEMA_VERSION,
    opts: { dryRun?: boolean; log?: (msg: string) => void } = {},
  ): Promise<{ from: number; to: number; steps: string[] }> {
    const dryRun = opts.dryRun === true;
    const log = opts.log ?? (() => undefined);
    const steps = this.plan(from, to);
    for (const step of steps) {
      log(`${dryRun ? '[dry-run] ' : ''}migrate ${step.id}: ${step.description}`);
      if (!dryRun) {
        await step.run({ from: step.from, to: step.to, dryRun, log });
      }
    }
    return { from, to, steps: steps.map((s) => s.id) };
  }
}

/** Built-in no-op step so hm update has a registered adapter even before Policy tables exist. */
export const BASELINE_MIGRATION_STEPS: MigrationStep[] = [
  {
    from: 0,
    to: 1,
    id: 'migrate-from-v0-platform-baseline',
    description: 'Record platform architecture baseline (additive, no data rewrite)',
    run: () => undefined,
  },
];
