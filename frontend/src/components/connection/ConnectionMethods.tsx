"use client";

import { Check } from "lucide-react";
import { useT } from "@/i18n/locale";
import type { OutputMethod, ProtocolCapabilities } from "./types";

export function ConnectionMethods({
  methods,
  capabilities,
}: {
  methods: OutputMethod[];
  capabilities?: ProtocolCapabilities;
}) {
  const t = useT();

  const labels: Record<OutputMethod, string> = {
    subscription: t("connection.methodSubscription"),
    native: t("connection.methodNative"),
    qr: t("connection.methodQr"),
    copy: t("connection.methodCopy"),
    nodes: t("connection.methodNodes"),
    preview: t("connection.methodPreview"),
    download: t("connection.methodDownload"),
    uri: t("connection.methodUri"),
  };

  if (!methods.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {methods.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <Check size={12} />
          {labels[m] || m}
        </span>
      ))}
      {capabilities && !capabilities.supportsSubscription ? (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-500 dark:bg-zinc-800">
          {t("connection.noSubscriptionUrl")}
        </span>
      ) : null}
    </div>
  );
}
