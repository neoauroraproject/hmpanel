import { Injectable, Logger } from '@nestjs/common';

type PanelGateState = {
  /** Active user-facing CRUD ops that should preempt sync. */
  interactive: number;
  /** In-flight background (sync) exclusive sections. */
  background: number;
  /** Abort controller for the current background HTTP call, if any. */
  abort: AbortController | null;
  waiters: Array<() => void>;
};

function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; code?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === 'AbortError' || e.name === 'CanceledError') return true;
  if (e.code === 'ERR_CANCELED' || e.code === 'ABORT_ERR') return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('aborted') || msg.includes('canceled') || msg.includes('cancelled');
}

/**
 * Per-panel priority coordination:
 * - Interactive (create/edit/delete/enable) preempts background sync.
 * - Sync remote HTTP runs only when no interactive work is pending; arriving
 *   interactive work aborts in-flight sync HTTP so the panel can respond.
 * - Sync DB batches call yieldToInteractive between chunks so CRUD is not
 *   starved by long upsert loops.
 */
@Injectable()
export class PanelPriorityGate {
  private readonly logger = new Logger(PanelPriorityGate.name);
  private readonly states = new Map<string, PanelGateState>();

  private state(panelId: string): PanelGateState {
    let s = this.states.get(panelId);
    if (!s) {
      s = { interactive: 0, background: 0, abort: null, waiters: [] };
      this.states.set(panelId, s);
    }
    return s;
  }

  hasInteractive(panelId: string): boolean {
    return (this.states.get(panelId)?.interactive ?? 0) > 0;
  }

  /**
   * User-facing panel mutations. Marks priority immediately, aborts sync HTTP
   * for this panel, then waits until the current background section releases.
   */
  async runInteractive<T>(panelId: string, fn: () => Promise<T>): Promise<T> {
    const s = this.state(panelId);
    s.interactive += 1;
    if (s.abort && !s.abort.signal.aborted) {
      this.logger.debug(
        `[PRIORITY] Aborting background sync HTTP for panel ${panelId} (interactive)`,
      );
      s.abort.abort();
    }
    this.wake(s);
    try {
      await this.waitWhile(s, () => s.background > 0);
      return await fn();
    } finally {
      s.interactive -= 1;
      this.wake(s);
    }
  }

  /**
   * Background sync exclusive work (typically one remote HTTP call).
   * Waits until no interactive ops are pending. If aborted because interactive
   * arrived, retries after interactive drains.
   */
  async runBackground<T>(
    panelId: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const s = this.state(panelId);
    // Bound retries so a pathological interactive storm cannot hang forever.
    for (let attempt = 0; attempt < 64; attempt++) {
      await this.waitWhile(s, () => s.interactive > 0);
      const ac = new AbortController();
      s.abort = ac;
      s.background += 1;
      this.wake(s);
      try {
        if (s.interactive > 0) {
          ac.abort();
          continue;
        }
        return await fn(ac.signal);
      } catch (err) {
        if (isAbortError(err) && (s.interactive > 0 || ac.signal.aborted)) {
          this.logger.debug(
            `[PRIORITY] Background work aborted for panel ${panelId}; will retry after interactive`,
          );
          await this.waitWhile(s, () => s.interactive > 0);
          continue;
        }
        throw err;
      } finally {
        s.background -= 1;
        if (s.abort === ac) s.abort = null;
        this.wake(s);
      }
    }
    throw new Error(
      `Panel ${panelId}: background work could not acquire slot (interactive busy)`,
    );
  }

  /** Pause sync between DB batches while interactive work is in flight. */
  async yieldToInteractive(panelId: string): Promise<void> {
    const s = this.state(panelId);
    if (s.interactive <= 0) return;
    this.logger.debug(
      `[PRIORITY] Sync yielding on panel ${panelId} (${s.interactive} interactive)`,
    );
    await this.waitWhile(s, () => s.interactive > 0);
  }

  private wake(s: PanelGateState) {
    const waiters = s.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private waitWhile(s: PanelGateState, pred: () => boolean): Promise<void> {
    if (!pred()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const tick = () => {
        if (!pred()) {
          resolve();
          return;
        }
        s.waiters.push(tick);
      };
      s.waiters.push(tick);
    });
  }
}

export { isAbortError };
