"use client";

/*
 * Per-admin Premium feature access, managed from the admins page. Uses the same
 * assignment API as Premium Settings > Admin management, so both stay in sync.
 * "live" saves each toggle immediately; "controlled" just reports the selection
 * (used by the new-admin wizard, which applies it after the account exists).
 */

import { clsx } from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gem } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { useToast } from "@/components/toast";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import type { PremiumModule } from "@/hooks/usePremiumModules";
import { PREMIUM_MENU_ICONS } from "@/lib/nav-config";

export type PremiumAssignment = {
  id?: string;
  adminId: string;
  moduleId: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
};

export function useIsPremiumLicense() {
  const { licenseQuery } = useLicenseActivation();
  return (
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled"
  );
}

/** Modules a reseller can be given (same filter as Premium Settings). */
export function useAssignableModules(enabled: boolean) {
  return useQuery({
    queryKey: ["premium-modules", "all"],
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        return (await api.get<PremiumModule[]>("/premium-modules/all")).data;
      } catch {
        return (await api.get<PremiumModule[]>("/platform/premium-modules-all")).data;
      }
    },
    // Never trust the shape: an older backend or proxy error page must not crash the Admins page.
    select: (all) => (Array.isArray(all) ? all : []).filter((m) => m.kind === "BUSINESS" && m.enabled && (m.phase ?? 0) <= 3),
  });
}

export function usePremiumAssignments(enabled: boolean) {
  return useQuery({
    queryKey: ["premium-modules", "assignments"],
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        return (await api.get<PremiumAssignment[]>("/premium-modules/assignments")).data;
      } catch {
        return (await api.get<PremiumAssignment[]>("/platform/premium-assignments")).data;
      }
    },
    select: (rows) => (Array.isArray(rows) ? rows : []),
  });
}

export async function postPremiumAssignment(body: PremiumAssignment) {
  try {
    return (await api.post("/premium-modules/assignments", body)).data;
  } catch {
    return (await api.post("/platform/premium-assignments", body)).data;
  }
}

function ModuleTile({
  module: m,
  on,
  busy,
  onToggle,
}: {
  module: PremiumModule;
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
}) {
  const Icon = PREMIUM_MENU_ICONS[m.id] || Gem;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
      className={clsx(
        "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-60",
        on
          ? "border-emerald-500/40 bg-emerald-500/[0.07]"
          : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
      )}
    >
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          on ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
        )}
      >
        {on ? <Check size={16} /> : <Icon size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{m.name}</span>
        {m.description ? <span className="block truncate text-[11px] text-zinc-500">{m.description}</span> : null}
      </span>
    </button>
  );
}

export function AdminPremiumAccess(
  props:
    | { mode: "live"; adminId: string }
    | { mode: "controlled"; value: string[]; onChange: (next: string[]) => void },
) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const premium = useIsPremiumLicense();
  const { data: modules = [], isLoading } = useAssignableModules(premium);
  const { data: assignments = [] } = usePremiumAssignments(premium && props.mode === "live");

  const assign = useMutation({
    mutationFn: postPremiumAssignment,
    onSuccess: () => {
      toast(t("adminTools.premiumSaved"));
      void qc.invalidateQueries({ queryKey: ["premium-modules"] });
    },
    onError: () => toast(t("admins.actionFailed"), "error"),
  });

  if (!premium) return null;

  const isOn = (moduleId: string) =>
    props.mode === "live"
      ? !!assignments.find((a) => a.adminId === props.adminId && a.moduleId === moduleId)?.enabled
      : props.value.includes(moduleId);

  return (
    <section className="space-y-3">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          <Gem size={15} className="text-emerald-500" /> {t("adminTools.premiumTitle")}
        </h4>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{t("adminTools.premiumHint")}</p>
      </div>
      {isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      ) : !modules.length ? (
        <p className="text-xs text-zinc-500">{t("adminTools.premiumNone")}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {modules.map((m) => (
            <ModuleTile
              key={m.id}
              module={m}
              on={isOn(m.id)}
              busy={props.mode === "live" && assign.isPending}
              onToggle={() => {
                if (props.mode === "live") {
                  const current = assignments.find((a) => a.adminId === props.adminId && a.moduleId === m.id);
                  assign.mutate({ adminId: props.adminId, moduleId: m.id, enabled: !current?.enabled, settings: current?.settings ?? {} });
                } else {
                  props.onChange(isOn(m.id) ? props.value.filter((id) => id !== m.id) : [...props.value, m.id]);
                }
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Compact chips of the modules an admin currently has (for admin cards). */
export function AdminPremiumChips({ adminId }: { adminId: string }) {
  const premium = useIsPremiumLicense();
  const { data: modules = [] } = useAssignableModules(premium);
  const { data: assignments = [] } = usePremiumAssignments(premium);
  if (!premium) return null;
  const on = modules.filter((m) => assignments.some((a) => a.adminId === adminId && a.moduleId === m.id && a.enabled));
  if (!on.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {on.map((m) => {
        const Icon = PREMIUM_MENU_ICONS[m.id] || Gem;
        return (
          <span key={m.id} className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-500/10 px-2 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300">
            <Icon size={11} aria-hidden /> {m.name}
          </span>
        );
      })}
    </div>
  );
}
