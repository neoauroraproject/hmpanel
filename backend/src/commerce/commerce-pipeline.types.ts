import type { DriverCreateClientInput, RemoteClientSnapshot } from '../panels/native/panel-driver.types';

export type CommerceFulfillInput = {
  adminId: string;
  panelId: string;
  panelType?: string | null;
  maxClients?: number;
  currentClients?: number;
  client: DriverCreateClientInput;
};

export type CommerceFulfillResult = {
  subscription: RemoteClientSnapshot;
};

/**
 * Product → Payment → Order → Provisioning → Panel Adapter → Subscription.
 * Implementations must not import 3x-ui/Eylan/Pasarguard SDKs; they call Core adapters.
 */
export interface CommercePipeline {
  fulfill(input: CommerceFulfillInput): Promise<CommerceFulfillResult>;
}
