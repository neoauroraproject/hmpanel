import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureCriticalSchema } from '../scripts/ensure-critical-schema';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to the database');
      // Idempotent patches for production DBs that never ran prisma migrate
      // (e.g. nextOrderNumber). Never block boot if a statement fails.
      try {
        await ensureCriticalSchema(this);
      } catch (err) {
        this.logger.warn(
          `ensureCriticalSchema skipped: ${(err as Error).message}`,
        );
      }
    } catch (err) {
      // Don't crash the app if the database is unreachable — the API (and Swagger)
      // must still boot. Endpoints that hit the DB will fail until it's available.
      this.logger.warn(
        `Database connection failed — starting without a live DB. ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
