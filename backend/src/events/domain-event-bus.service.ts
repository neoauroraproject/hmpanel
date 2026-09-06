import { Injectable } from '@nestjs/common';
import { DomainEventBus } from './domain-event.bus';

@Injectable()
export class DomainEventBusService extends DomainEventBus {}
