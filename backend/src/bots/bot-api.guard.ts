import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BotApiService } from './bot-api.service';

/** Shared by every guard instance, so the premium routes count against the same per-key limit. */
const hits = new Map<string, { n: number; reset: number }>();

@Injectable()
export class BotApiKeyGuard implements CanActivate {

  constructor(private bots: BotApiService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = String(req.headers['x-api-key'] || req.headers['authorization'] || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) throw new UnauthorizedException('API key required');
    const client = await this.bots.authenticate(token);
    this.assertRateLimit(client.id, client.rateLimitPerMin || 60);
    req.botApiClient = client;
    return true;
  }

  private assertRateLimit(clientId: string, perMin: number) {
    const now = Date.now();
    const cur = hits.get(clientId);
    if (!cur || now >= cur.reset) {
      hits.set(clientId, { n: 1, reset: now + 60_000 });
      return;
    }
    cur.n += 1;
    if (cur.n > perMin) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
