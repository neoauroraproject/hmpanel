import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ClientOutputModel } from './client-output.types';
import { OUTPUT_BUILDER_VERSION } from './client-output.types';

type CacheEntry = {
  key: string;
  model: ClientOutputModel;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

@Injectable()
export class OutputCacheService {
  private readonly store = new Map<string, CacheEntry>();

  buildKey(parts: {
    uuid: string;
    updatedAt: Date | string | number;
    inboundId?: string | null;
    origin?: string | null;
  }): string {
    const updated =
      parts.updatedAt instanceof Date
        ? parts.updatedAt.toISOString()
        : String(parts.updatedAt);
    const raw = [
      parts.uuid,
      updated,
      parts.inboundId || '',
      parts.origin || '',
      OUTPUT_BUILDER_VERSION,
    ].join('|');
    return createHash('sha256').update(raw).digest('hex');
  }

  get(key: string): ClientOutputModel | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.model;
  }

  set(key: string, model: ClientOutputModel, ttlMs = DEFAULT_TTL_MS) {
    if (this.store.size >= MAX_ENTRIES) {
      // Simple eviction: drop oldest half by insertion order
      const keys = [...this.store.keys()];
      for (let i = 0; i < Math.floor(keys.length / 2); i++) {
        this.store.delete(keys[i]);
      }
    }
    this.store.set(key, {
      key,
      model: { ...model, cacheKey: key, builtAt: new Date().toISOString() },
      expiresAt: Date.now() + ttlMs,
    });
  }
}
