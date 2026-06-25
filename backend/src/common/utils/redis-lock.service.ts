import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redisClient: Redis;

  onModuleInit() {
    this.redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
    this.logger.log('Redis client for locking initialized.');
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  /**
   * Acquires a distributed lock.
   * @param key The unique lock key.
   * @param ttlMs Time-to-live in milliseconds.
   * @returns true if lock acquired, false if already locked.
   */
  async acquireLock(key: string, ttlMs: number = 30000): Promise<boolean> {
    try {
      // SET key value NX PX ttl
      const result = await this.redisClient.set(key, 'LOCKED', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Error acquiring lock for key ${key}: ${error.message}`);
      return false; // Fail safe by denying the lock
    }
  }

  /**
   * Releases a distributed lock.
   * @param key The unique lock key.
   */
  async releaseLock(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.error(`Error releasing lock for key ${key}: ${error.message}`);
    }
  }
}
