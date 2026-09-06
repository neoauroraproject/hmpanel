import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/roles.guard';
import { JobCenterService } from './job-center.service';

/** Additive Job Center listing — Premium UI can keep using Settings tabs. */
@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('platform/jobs')
export class JobCenterController {
  constructor(private jobs: JobCenterService) {}

  @Get()
  list() {
    return { queues: this.jobs.queues(), items: this.jobs.list() };
  }
}
