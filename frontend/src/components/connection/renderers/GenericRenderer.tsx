"use client";

import type { ConnectionRendererProps } from "../RendererRegistry";
import { ConnectionMethods } from "../ConnectionMethods";

export function GenericRenderer({ output }: ConnectionRendererProps) {
  return (
    <div className="space-y-3">
      <ConnectionMethods methods={output.methods} capabilities={output.capabilities} />
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">
          Protocol: {output.protocol || "unknown"}
        </p>
        <p className="mt-2 text-[13px]">
          {output.warnings?.length
            ? output.warnings.join(" ")
            : "No dedicated connection methods for this protocol yet."}
        </p>
      </div>
    </div>
  );
}
