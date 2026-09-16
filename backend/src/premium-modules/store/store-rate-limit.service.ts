import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type RateLimitRule = {
  limit: number;
  windowMs: number;
};

@Injectable()
export class StoreRateLimitService {
  private readonly buckets = new Map<string, number[]>();

  private readonly rules: Record<string, RateLimitRule> = {
    checkout: { limit: 10, windowMs: 1000 * 60 * 10 },
    tracking: { limit: 120, windowMs: 1000 * 60 * 10 },
    customerLookup: { limit: 20, windowMs: 1000 * 60 * 10 },
    customerLogin: { limit: 15, windowMs: 1000 * 60 * 10 },
    renewal: { limit: 12, windowMs: 1000 * 60 * 10 },
    'claim-service': { limit: 15, windowMs: 1000 * 60 * 10 },
    telegramSession: { limit: 30, windowMs: 1000 * 60 * 10 },
    telegramWebhook: { limit: 120, windowMs: 1000 * 60 * 10 },
    eylanTest: { limit: 8, windowMs: 1000 * 60 * 10 },
    eylanOptions: { limit: 20, windowMs: 1000 * 60 * 10 },
    pasarguardTest: { limit: 8, windowMs: 1000 * 60 * 10 },
    pasarguardOptions: { limit: 20, windowMs: 1000 * 60 * 10 },
    agencyWebhook: { limit: 120, windowMs: 1000 * 60 * 10 },
    agencyCharge: { limit: 20, windowMs: 1000 * 60 * 10 },
    agencyNew: { limit: 15, windowMs: 1000 * 60 * 10 },
    agencyLogin: { limit: 10, windowMs: 1000 * 60 * 10 },
  };

  check(scope: keyof StoreRateLimitService['rules'], key: string) {
    const rule = this.rules[scope];
    const now = Date.now();
    const bucketKey = `${scope}:${key}`;
    const windowStart = now - rule.windowMs;
    const timestamps = (this.buckets.get(bucketKey) ?? []).filter((ts) => ts >= windowStart);

    if (timestamps.length >= rule.limit) {
      throw new HttpException('Too many requests, please try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    timestamps.push(now);
    this.buckets.set(bucketKey, timestamps);
  }
}
