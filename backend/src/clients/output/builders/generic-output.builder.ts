import type { ClientOutputModel } from '../client-output.types';
import { getCapabilitiesForOutputType } from '../output-type.resolver';

export function buildGenericOutput(ctx: {
  clientId: string;
  protocol: string;
}): ClientOutputModel {
  const { capabilities, methods } = getCapabilitiesForOutputType('generic');
  return {
    clientId: ctx.clientId,
    protocol: ctx.protocol || 'unknown',
    outputType: 'generic',
    capabilities,
    methods,
    warnings: [
      `Protocol "${ctx.protocol || 'unknown'}" has no dedicated connection renderer yet.`,
    ],
    payload: {},
  };
}
