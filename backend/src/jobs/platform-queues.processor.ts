import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

@Processor('backups')
export class BackupsQueueProcessor {
  private readonly logger = new Logger(BackupsQueueProcessor.name);

  @Process('generate')
  async generate(job: Job) {
    this.logger.log(`backup job ${job.id} type=${job.data?.type || 'full'}`);
    return { ok: true, type: job.data?.type || 'full' };
  }
}

@Processor('cleanup')
export class CleanupQueueProcessor {
  private readonly logger = new Logger(CleanupQueueProcessor.name);

  @Process('run')
  async run(job: Job) {
    this.logger.log(`cleanup job ${job.id} count=${job.data?.count ?? 0}`);
    return { ok: true, count: job.data?.count ?? 0 };
  }
}
