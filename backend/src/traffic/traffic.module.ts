import { Module } from '@nestjs/common';
import { TrafficService } from './traffic.service';
import { TrafficController } from './traffic.controller';
import { AdminQuotaService } from './admin-quota.service';

@Module({
  controllers: [TrafficController],
  providers: [TrafficService, AdminQuotaService],
  exports: [TrafficService, AdminQuotaService],
})
export class TrafficModule {}
