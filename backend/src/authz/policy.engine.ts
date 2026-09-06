import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type PolicyOperation = 'CREATE_USER' | 'DEBIT_TRAFFIC';

export type PolicyReservationStatus = 'reserved' | 'committed' | 'rolled_back';

export interface PolicyReserveInput {
  adminId: string;
  operation: PolicyOperation;
  maxClients?: number;
  currentClients?: number;
  pendingCount?: number;
  trafficBytes?: bigint | number;
  balance?: number;
  unlimitedTraffic?: boolean;
  role?: string;
  persist?: boolean;
}

export interface PolicyReservation {
  id: string;
  adminId: string;
  operation: PolicyOperation;
  status: PolicyReservationStatus;
  payload: Record<string, unknown>;
}

@Injectable()
export class PolicyEngine {
  private readonly memory = new Map<string, PolicyReservation>();

  constructor(private prisma?: PrismaService) {}

  async reserve(input: PolicyReserveInput): Promise<PolicyReservation> {
    this.assertLimits(input);
    const reservation: PolicyReservation = {
      id: randomUUID(),
      adminId: input.adminId,
      operation: input.operation,
      status: 'reserved',
      payload: {
        maxClients: input.maxClients ?? 0,
        currentClients: input.currentClients ?? 0,
        trafficBytes: String(input.trafficBytes ?? 0),
      },
    };
    this.memory.set(reservation.id, reservation);
    if (input.persist && this.prisma) {
      try {
        await (this.prisma as any).policyReservation.create({
          data: {
            id: reservation.id,
            adminId: input.adminId,
            operation: input.operation,
            status: reservation.status,
            payload: reservation.payload,
          },
        });
      } catch {
        // Table may not exist until migrate; in-memory reservation still holds.
      }
    }
    return reservation;
  }

  async commit(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const row = this.memory.get(id);
    if (row) {
      row.status = 'committed';
      this.memory.set(id, row);
    }
    await this.safeUpdate(id, 'committed');
  }

  async rollback(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const row = this.memory.get(id);
    if (row) {
      row.status = 'rolled_back';
      this.memory.set(id, row);
    }
    await this.safeUpdate(id, 'rolled_back');
  }

  get(id: string): PolicyReservation | undefined {
    return this.memory.get(id);
  }

  /**
   * Run adapter work between reserve and commit. On throw, reservation is rolled back.
   */
  async runReserved<T>(
    input: PolicyReserveInput,
    execute: () => Promise<T>,
  ): Promise<T> {
    const reservation = await this.reserve(input);
    try {
      const result = await execute();
      await this.commit(reservation.id);
      return result;
    } catch (err) {
      await this.rollback(reservation.id);
      throw err;
    }
  }

  private assertLimits(input: PolicyReserveInput): void {
    if (input.role === 'SUPER_ADMIN' || input.unlimitedTraffic) {
      if (input.operation === 'CREATE_USER') {
        const max = input.maxClients ?? 0;
        const current = input.currentClients ?? 0;
        const pending = input.pendingCount ?? 0;
        if (max > 0 && current + pending >= max) {
          throw new BadRequestException(
            `Client limit reached. Maximum allowed: ${max}`,
          );
        }
      }
      return;
    }

    if (input.operation === 'CREATE_USER') {
      const max = input.maxClients ?? 0;
      const current = input.currentClients ?? 0;
      const pending = input.pendingCount ?? 0;
      if (max > 0 && current + pending >= max) {
        throw new BadRequestException(
          `Client limit reached. Maximum allowed: ${max}`,
        );
      }
    }

    if (input.operation === 'DEBIT_TRAFFIC') {
      const amount = Number(input.trafficBytes ?? 0);
      if (amount > 0 && input.balance != null && input.balance < amount) {
        throw new BadRequestException('Insufficient traffic balance');
      }
    }
  }

  private async safeUpdate(id: string, status: PolicyReservationStatus) {
    if (!this.prisma) return;
    try {
      await (this.prisma as any).policyReservation.update({
        where: { id },
        data: { status },
      });
    } catch {
      /* ignore */
    }
  }
}
