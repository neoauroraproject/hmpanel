import { PanelPriorityGate, isAbortError } from './panel-priority-gate';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('PanelPriorityGate', () => {
  it('lets interactive run immediately when idle', async () => {
    const gate = new PanelPriorityGate();
    const out = await gate.runInteractive('p1', async () => 'ok');
    expect(out).toBe('ok');
  });

  it('blocks background while interactive is active', async () => {
    const gate = new PanelPriorityGate();
    let backgroundStarted = false;
    let releaseInteractive!: () => void;
    const interactiveHold = new Promise<void>((r) => {
      releaseInteractive = r;
    });

    const interactive = gate.runInteractive('p1', async () => {
      await interactiveHold;
      return 'interactive';
    });

    await delay(5);
    const background = gate.runBackground('p1', async () => {
      backgroundStarted = true;
      return 'bg';
    });

    await delay(20);
    expect(backgroundStarted).toBe(false);

    releaseInteractive();
    await expect(interactive).resolves.toBe('interactive');
    await expect(background).resolves.toBe('bg');
    expect(backgroundStarted).toBe(true);
  });

  it('aborts in-flight background when interactive arrives', async () => {
    const gate = new PanelPriorityGate();
    let sawAbort = false;
    let bgAttempts = 0;

    const background = gate.runBackground('p1', async (signal) => {
      bgAttempts += 1;
      if (bgAttempts === 1) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            sawAbort = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          };
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
          // Hold until aborted (or timeout for safety)
          setTimeout(() => resolve(), 5_000);
        });
      }
      return 'done';
    });

    await delay(10);
    const interactive = gate.runInteractive('p1', async () => {
      await delay(30);
      return 'ui';
    });

    await expect(interactive).resolves.toBe('ui');
    await expect(background).resolves.toBe('done');
    expect(sawAbort).toBe(true);
    expect(bgAttempts).toBeGreaterThanOrEqual(2);
  });

  it('yieldToInteractive pauses until interactive drains', async () => {
    const gate = new PanelPriorityGate();
    let yieldedPast = false;
    let release!: () => void;
    const hold = new Promise<void>((r) => {
      release = r;
    });

    void gate.runInteractive('p1', async () => {
      await hold;
    });
    await delay(5);

    const yieldPromise = (async () => {
      await gate.yieldToInteractive('p1');
      yieldedPast = true;
    })();

    await delay(20);
    expect(yieldedPast).toBe(false);
    release();
    await yieldPromise;
    expect(yieldedPast).toBe(true);
  });

  it('detects abort errors', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isAbortError({ message: 'Request aborted' })).toBe(true);
    expect(isAbortError({ message: 'timeout' })).toBe(false);
  });
});
