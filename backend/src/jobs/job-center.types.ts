export type JobCenterStatus = 'queued' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobCenterItem {
  id: string;
  queue: string;
  name: string;
  status: JobCenterStatus;
  progress?: number;
  createdAt: string;
  finishedAt?: string;
  error?: string;
}

export const JOB_CENTER_QUEUES = [
  'monitoring',
  'backups',
  'cleanup',
  'ssl',
  'panel-sync',
  'platform-jobs',
] as const;

export type JobCenterQueueName = (typeof JOB_CENTER_QUEUES)[number];
