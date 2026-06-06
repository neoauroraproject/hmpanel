import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [PanelsModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
