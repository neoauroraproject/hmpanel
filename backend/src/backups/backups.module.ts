import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
