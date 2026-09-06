import { Injectable } from '@nestjs/common';
import { JOB_CENTER_QUEUES, type JobCenterItem, type JobCenterQueueName } from './job-center.types';

@Injectable()
export class JobCenterService {
  private readonly items: JobCenterItem[] = [];

  queues(): readonly JobCenterQueueName[] {
    return JOB_CENTER_QUEUES;
  }

  enqueue(
    queue: JobCenterQueueName,
    name: string,
    extra?: Partial<JobCenterItem>,
  ): JobCenterItem {
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
    this.items.unshift(item);
    if (this.items.length > 200) this.items.pop();
    return item;
  }

  list(limit = 50): JobCenterItem[] {
    return this.items.slice(0, limit);
  }
}
