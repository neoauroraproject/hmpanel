import { Module, forwardRef } from '@nestjs/common';
import { BulkClientsService } from './bulk-clients.service';
import { BulkClientsController } from './bulk-clients.controller';
import { PanelsModule } from '../panels/panels.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [forwardRef(() => PanelsModule), forwardRef(() => ClientsModule)],
  controllers: [BulkClientsController],
  providers: [BulkClientsService],
  exports: [BulkClientsService],
})
export class BulkClientsModule {}
