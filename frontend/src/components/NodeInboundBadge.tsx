"use client";

import { isNodeInbound, nodeInboundLabel } from "@/lib/inbound-node";

/** Compact badge for remote-node inbounds (hidden for local master xray). */
export function NodeInboundBadge({
  inbound,
}: {
  inbound: {
    nodeId?: number | null;
    originNodeGuid?: string | null;
    nodeName?: string | null;
  };
}) {
  if (!isNodeInbound(inbound)) return null;
  const label = nodeInboundLabel(inbound) || "Node";
  return (
    <span
      title={`Hosted on node: ${label}`}
      className="inline-flex max-w-[7rem] shrink-0 items-center truncate rounded-md border border-sky-300/70 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
    >
      {label}
    </span>
  );
}
