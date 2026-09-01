import type { ClientOutputModel } from '../client-output.types';
import { getCapabilitiesForOutputType } from '../output-type.resolver';

export function buildExternalPanelSubscriptionOutput(ctx: {
  clientId: string;
  protocol: string;
  nativeSubUrl: string | null;
  systemSubUrl: string;
  warnings?: string[];
}): ClientOutputModel {
  const { capabilities, methods } = getCapabilitiesForOutputType('subscription');
  const native = String(ctx.nativeSubUrl || '').trim() || null;
  const system = String(ctx.systemSubUrl || native || '').trim();
  const warnings = [...(ctx.warnings || [])];
  if (!system) {
    warnings.push('Could not load a subscription URL from the remote panel.');
  }
  return {
    clientId: ctx.clientId,
    protocol: ctx.protocol,
    outputType: 'subscription',
    capabilities,
    methods,
    warnings,
    payload: {
      systemSubUrl: system,
      nativeSubUrl: native,
      qrText: system || native || '',
    },
  };
}
