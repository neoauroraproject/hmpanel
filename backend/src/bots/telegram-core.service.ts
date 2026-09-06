import { Injectable } from '@nestjs/common';
import { TelegramCoreContract } from './telegram-core.contract';

@Injectable()
export class TelegramCoreService extends TelegramCoreContract {}
