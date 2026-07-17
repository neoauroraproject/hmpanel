"use client";

import { Check } from "lucide-react";
import type { OutputMethod, ProtocolCapabilities } from "./types";

const LABELS: Record<OutputMethod, string> = {
  subscription: "Subscription",
  native: "Native link",
  qr: "QR Code",
  copy: "Copy",
  nodes: "Nodes",
  preview: "Preview",
  download: "Config file",
  uri: "URI",
};

export function ConnectionMethods({
  methods,
  capabilities,
}: {
  methods: OutputMethod[];
  capabilities?: ProtocolCapabilities;
}) {
  if (!methods.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {methods.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <Check size={12} />
          {LABELS[m] || m}
        </span>
      ))}
      {capabilities && !capabilities.supportsSubscription ? (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-500 dark:bg-zinc-800">
          No subscription URL
        </span>
      ) : null}
    </div>
  );
}
