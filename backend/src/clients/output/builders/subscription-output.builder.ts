import type { ClientOutputModel } from '../client-output.types';
import { getCapabilitiesForOutputType } from '../output-type.resolver';
import { buildNativeSubscriptionUrl } from '../../../common/utils/native-sub-url';

type BuildCtx = {
  clientId: string;
  protocol: string;
  client: {
    id: string;
    email: string;
    subId?: string | null;
    subToken?: string | null;
  };
  inbound?: {
    id: string;
    protocol: string;
    panel?: {
      url?: string | null;
      subUrl?: string | null;
    } | null;
  } | null;
  origin?: string;
  nodes?: Array<{ link: string; protocol?: string; tag?: string }>;
};

export function buildSubscriptionOutput(ctx: BuildCtx): ClientOutputModel {
  const { capabilities, methods } = getCapabilitiesForOutputType('subscription');
  const warnings: string[] = [];
  const subKey = ctx.client.subId || ctx.client.email;
  const origin = (ctx.origin || '').replace(/\/$/, '');

  const systemSubUrl = origin
    ? `${origin}/s/${encodeURIComponent(subKey)}`
    : `/s/${encodeURIComponent(subKey)}`;

  const panel = ctx.inbound?.panel;
  const nativeSubUrl = buildNativeSubscriptionUrl(
    panel?.subUrl,
    panel?.url,
    subKey || '',
  );

  if (!subKey) warnings.push('Missing subscription identifier');

  return {
    clientId: ctx.clientId,
    protocol: ctx.protocol || 'vless',
    outputType: 'subscription',
    capabilities,
    methods,
    warnings,
    payload: {
      systemSubUrl,
      nativeSubUrl,
      qrText: systemSubUrl,
      nodes: ctx.nodes || [],
    },
  };
}
