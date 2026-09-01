"use client";

import { create } from "zustand";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Tone) => void;
  remove: (id: number) => void;
}

let seq = 1;

function formatToastMessage(message: unknown): string {
  if (message == null) return "";
  if (typeof message === "string") return message;
  if (typeof message === "number" || typeof message === "boolean") return String(message);
  if (Array.isArray(message)) return message.map(formatToastMessage).filter(Boolean).join(", ");
  if (typeof message === "object") {
    const rec = message as Record<string, unknown>;
    const nested = formatToastMessage(rec.message ?? rec.detail ?? rec.error ?? rec.msg);
    if (nested) return nested;
    try {
      const json = JSON.stringify(message);
      if (json && json !== "{}" && json !== "[]") return json.slice(0, 300);
    } catch {
      /* ignore */
    }
    return "";
  }
  return String(message);
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "success") => {
    const id = seq++;
    const text = formatToastMessage(message) || "Error";
    set((s) => ({ toasts: [...s.toasts, { id, message: text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const COLORS = {
  success: "border-emerald-500/40 text-emerald-300",
  error: "border-red-500/40 text-red-300",
  info: "border-blue-500/40 text-blue-300",
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);
  return (
    <div className="pointer-events-none fixed bottom-5 end-5 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`pointer-events-auto flex items-center gap-2 rounded-lg border bg-white dark:bg-zinc-900 px-4 py-3 text-sm shadow-lg ${COLORS[t.tone]}`}
          >
            <Icon size={16} />
            <span className="text-zinc-800 dark:text-zinc-100">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
