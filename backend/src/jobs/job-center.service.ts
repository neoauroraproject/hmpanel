import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import {
  JOB_CENTER_QUEUES,
  type JobCenterItem,
  type JobCenterQueueName,
  type JobCenterStatus,
} from './job-center.types';

export interface JobCenterUiItem {
  id: string;
  queue: string;
  type: string;
  name: string;
  moduleId?: string;
  status: string;
  progress: number;
  attempts: number;
  errorLog?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  finishedAt?: string;
}

const BULL_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

function mapState(state: string): JobCenterStatus {
  if (state === 'active') return 'active';
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'delayed') return 'delayed';
  return 'queued';
}

function uiStatus(status: JobCenterStatus): string {
  if (status === 'active') return 'RUNNING';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  return 'QUEUED';
}

@Injectable()
export class JobCenterService {
  private readonly logger = new Logger(JobCenterService.name);
  private readonly memory: JobCenterItem[] = [];

  constructor(
    @Optional() @InjectQueue('monitoring') private monitoring?: Queue,
    @Optional() @InjectQueue('backups') private backups?: Queue,
    @Optional() @InjectQueue('cleanup') private cleanup?: Queue,
  ) {}

  queues(): readonly JobCenterQueueName[] {
    return JOB_CENTER_QUEUES;
  }

  async enqueue(
    queue: JobCenterQueueName,
    name: string,
    extra?: Partial<JobCenterItem> & { data?: Record<string, unknown> },
  ): Promise<JobCenterItem> {
    const bull = this.queueByName(queue);
    if (bull) {
      try {
        const job = await bull.add(name, extra?.data || { name }, {
          jobId: extra?.id,
          removeOnComplete: 80,
          removeOnFail: 80,
        });
        return this.toItem(queue, job, extra?.status || 'queued');
      } catch (err: any) {
        this.logger.warn(`Bull enqueue ${queue}/${name} failed: ${err?.message || err}`);
      }
    }
    const item: JobCenterItem = {
      id: extra?.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      queue,
      name,
      status: extra?.status || 'queued',
      progress: extra?.progress,
      createdAt: extra?.createdAt || new Date().toISOString(),
      finishedAt: extra?.finishedAt,
      error: extra?.error,
    };
    this.memory.unshift(item);
    if (this.memory.length > 200) this.memory.pop();
    return item;
  }

  async list(limit = 50): Promise<JobCenterItem[]> {
    const fromBull = (
      await Promise.all([
        this.collect('monitoring', this.monitoring),
        this.collect('backups', this.backups),
        this.collect('cleanup', this.cleanup),
      ])
    ).flat();
    const merged = [...fromBull, ...this.memory];
    merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return merged.slice(0, limit);
  }

  async listUi(limit = 50): Promise<JobCenterUiItem[]> {
    const items = await this.list(limit);
    return items.map((item) => ({
      id: item.id,
      queue: item.queue,
      type: item.name,
      name: item.name,
      moduleId: item.queue,
      status: uiStatus(item.status),
      progress: item.progress ?? 0,
      attempts: 0,
      errorLog: item.error,
      error: item.error,
      createdAt: item.createdAt,
      completedAt: item.finishedAt,
      finishedAt: item.finishedAt,
    }));
  }

  async stats() {
    const items = await this.listUi(200);
    return {
      queued: items.filter((i) => i.status === 'QUEUED').length,
      running: items.filter((i) => i.status === 'RUNNING').length,
      completed: items.filter((i) => i.status === 'COMPLETED').length,
      failed: items.filter((i) => i.status === 'FAILED').length,
    };
  }

  async retry(id: string) {
    const sep = id.indexOf('__');
    const queueName = sep > 0 ? id.slice(0, sep) : '';
    const jobId = sep > 0 ? id.slice(sep + 2) : id;
    const q = this.queueByName(queueName as JobCenterQueueName);
    if (!q) throw new NotFoundException('Queue not found');
    const job = await q.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    await job.retry();
    return { ok: true };
  }

  private queueByName(name: string): Queue | undefined {
    if (name === 'monitoring') return this.monitoring;
    if (name === 'backups') return this.backups;
    if (name === 'cleanup') return this.cleanup;
    return undefined;
  }

  private async collect(queue: string, bull?: Queue): Promise<JobCenterItem[]> {
    if (!bull) return [];
    try {
      const jobs = await bull.getJobs([...BULL_STATES], 0, 80);
      const out: JobCenterItem[] = [];
      for (const job of jobs) {
        const state = await job.getState().catch(() => 'waiting');
        out.push(this.toItem(queue, job, mapState(state)));
      }
      return out;
    } catch (err: any) {
      this.logger.warn(`Bull list ${queue} failed: ${err?.message || err}`);
      return [];
    }
  }

  private toItem(queue: string, job: Job, status: JobCenterStatus): JobCenterItem {
    return {
      id: `${queue}__${job.id}`,
      queue,
      name: job.name || 'job',
      status,
      progress: typeof job.progress === 'function' ? Number(job.progress()) || 0 : 0,
      createdAt: new Date(job.timestamp || Date.now()).toISOString(),
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      error: job.failedReason || undefined,
    };
  }
}
