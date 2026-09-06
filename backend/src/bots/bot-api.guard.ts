import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { BotApiService } from './bot-api.service';

@Injectable()
export class BotApiKeyGuard implements CanActivate {
  constructor(private bots: BotApiService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = String(req.headers['x-api-key'] || req.headers['authorization'] || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) throw new UnauthorizedException('API key required');
    req.botApiClient = await this.bots.authenticate(token);
    return true;
  }
}
