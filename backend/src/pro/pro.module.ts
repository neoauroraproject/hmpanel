import { Module } from '@nestjs/common';
import { ProController } from './pro.controller';
import { ProService } from './pro.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [PrismaModule, PanelsModule],
  controllers: [ProController],
  providers: [ProService]
})
export class ProModule {}
