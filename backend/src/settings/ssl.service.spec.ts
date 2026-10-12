import { HttpException } from '@nestjs/common';
import { Observable, Subject, firstValueFrom, toArray } from 'rxjs';
import { SslService } from './ssl.service';
import { HmctlClient, HmctlEvent } from './hmctl.client';

function makeService() {
  const runs: Array<{ action: string; args: string[]; events: Subject<HmctlEvent> }> = [];
  const hmctl = {
    executeStream: (_module: string, action: string, args: string[]) => {
      const events = new Subject<HmctlEvent>();
      runs.push({ action, args, events });
      return events.asObservable() as Observable<HmctlEvent>;
    },
  } as unknown as HmctlClient;
  return { service: new SslService(hmctl), runs };
}

const collect = (stream: Observable<{ data: unknown }>) =>
  firstValueFrom(stream.pipe(toArray()));

describe('SslService operation streams', () => {
  it('delivers only the matching operation to a stream opened before the request', async () => {
    const { service, runs } = makeService();

    const first = collect(service.getStream('op-first'));
    const firstRun = service.repair('op-first');
    runs[0].events.next({ type: 'progress', message: 'one' });
    runs[0].events.next({ type: 'complete', data: { code: 'REPAIR_SUCCESS' } });
    runs[0].events.complete();
    await firstRun;

    const second = collect(service.getStream('op-second'));
    const secondRun = service.renew('op-second');
    runs[1].events.next({ type: 'complete', data: { code: 'RENEW_NOT_DUE' } });
    runs[1].events.complete();
    await secondRun;

    expect((await first).map((e) => (e.data as any).type)).toEqual(['progress', 'complete']);
    const secondEvents = await second;
    expect(secondEvents).toHaveLength(1);
    expect((secondEvents[0].data as any).data.code).toBe('RENEW_NOT_DUE');
  });

  it('replays a finished operation to a reconnecting browser', async () => {
    const { service, runs } = makeService();
    const run = service.switchMode(true, 'op-replay');
    runs[0].events.next({ type: 'progress', message: 'reloading' });
    runs[0].events.next({ type: 'complete', data: { https: true } });
    runs[0].events.complete();
    await expect(run).resolves.toEqual({ success: true, https: true });

    const replay = await collect(service.getStream('op-replay'));
    expect(replay.map((e) => (e.data as any).type)).toEqual(['progress', 'complete']);
  });

  it('forces renewal from the button and passes args through', async () => {
    const { service, runs } = makeService();
    const run = service.renew('op-renew');
    expect(runs[0]).toMatchObject({ action: 'renew', args: ['force'] });
    runs[0].events.next({ type: 'complete', data: { log: 'renewed' } });
    await expect(run).resolves.toEqual({ success: true, log: 'renewed' });
  });

  it('rejects a second operation while one is running', async () => {
    const { service, runs } = makeService();
    const run = service.repair('op-a');
    await expect(service.repair('op-b')).rejects.toMatchObject({ status: 409 });
    runs[0].events.next({ type: 'complete', data: {} });
    await run;
  });

  it('surfaces the CLI reason as the request error', async () => {
    const { service, runs } = makeService();
    const run = service.issue('panel.example.com', 'ops@example.com', false, 'op-fail');
    expect(runs[0]).toMatchObject({
      action: 'issue',
      args: ['panel.example.com', 'ops@example.com'],
    });
    runs[0].events.next({
      type: 'error',
      error: { code: 'DNS_MISMATCH', reason: 'panel.example.com points elsewhere' },
    });
    await expect(run).rejects.toThrow('panel.example.com points elsewhere');
    // The lock is released afterwards.
    const next = service.repair('op-after');
    runs[1].events.next({ type: 'complete', data: {} });
    await expect(next).resolves.toEqual({});
  });

  it('validates domain and email before touching the host', async () => {
    const { service, runs } = makeService();
    await expect(service.issue('not a domain', '', false)).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.issue('panel.example.com', 'bad"email@x.com', false),
    ).rejects.toBeInstanceOf(HttpException);
    expect(runs).toHaveLength(0);

    const run = service.issue('Panel.Example.com ', '', false, 'op-norm');
    expect(runs[0].args).toEqual(['panel.example.com', '']);
    runs[0].events.next({ type: 'complete', data: {} });
    await run;
  });
});
