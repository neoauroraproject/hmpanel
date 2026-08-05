"use client";

import { isNodeInbound } from "@/lib/inbound-node";

/** Compact badge shown next to node-hosted inbound names. */
export function NodeInboundBadge({
  inbound,
}: {
  inbound: { nodeId?: number | null; originNodeGuid?: string | null };
}) {
  if (!isNodeInbound(inbound)) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-sky-300/70 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
      Node
    </span>
  );
}
