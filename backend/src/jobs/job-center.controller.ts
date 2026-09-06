import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
    return this.jobs.listUi();
  }

  @Get('stats')
  stats() {
    return this.jobs.stats();
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.jobs.retry(id);
  }
}
