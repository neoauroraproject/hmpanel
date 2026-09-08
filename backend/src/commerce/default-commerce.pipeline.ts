import { Injectable } from '@nestjs/common';
import { ProvisioningEngine } from '../provisioning/provisioning.engine';
import type {
  CommerceFulfillInput,
  CommerceFulfillResult,
  CommercePipeline,
} from './commerce-pipeline.types';

@Injectable()
export class DefaultCommercePipeline implements CommercePipeline {
  constructor(private provisioning: ProvisioningEngine) {}

  async fulfill(input: CommerceFulfillInput): Promise<CommerceFulfillResult> {
    const subscription = await this.provisioning.provisionUser(input);
    return { subscription };
  }
}
