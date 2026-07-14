import { Injectable } from '@nestjs/common';
@Injectable()
export class StoreRateLimitService {
  check(action: string, key: string) {}
}
