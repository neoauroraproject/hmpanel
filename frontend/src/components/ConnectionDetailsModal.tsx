"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatBytes } from "@/lib/format";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { getConnectionRenderer } from "@/components/connection/RendererRegistry";
import type { ClientOutputModel } from "@/components/connection/types";

interface ConnectionDetailsModalProps {
  client: any;
  portalSettings: any;
  onClose: () => void;
}

export function ConnectionDetailsModal({
  client,
  portalSettings,
  onClose,
}: ConnectionDetailsModalProps) {
  const used = Number(client.up) + Number(client.down);
  const total = Number(client.total);
  const currentInbound =
    client.inbounds?.[0]?.inbound || client.inbounds?.[0] || client.inbound;

  const { data: output, isLoading, error } = useQuery({
    queryKey: ["client-output", client.id],
    queryFn: async () =>
      (await api.get(`/clients/${client.id}/output`)).data as ClientOutputModel,
    enabled: !!client.id,
  });

  const Renderer = output ? getConnectionRenderer(output.outputType) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mt-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:mt-0 md:max-h-none md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            Connection Details
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Client
              </div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {client.remark || client.email}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Status
              </div>
              <div className="text-sm">
                {client.enable ? (
                  <span className="font-medium text-emerald-500">Active</span>
                ) : (
                  <span className="font-medium text-red-400">Disabled</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Traffic
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {formatBytes(used)}
                </span>{" "}
                / {total === 0 ? "Unlimited" : formatBytes(total)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Protocol
              </div>
              <div className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {output?.protocol || currentInbound?.protocol || "—"}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              Loading connection methods…
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30">
              Failed to load connection output
            </div>
          ) : output && Renderer ? (
            <Renderer
              output={output}
              admin
              showPlatformQR={portalSettings?.showPlatformQR !== false}
              showNativeQR={portalSettings?.showNativeQR !== false}
              allowQRDownload={portalSettings?.allowQRDownload !== false}
            />
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
