"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n";

export const TOPUP_HREF = "/premium/admin-recharge?topup=1";
/** Fired when the button is used while the top-up page is already open. */
export const TOPUP_EVENT = "hm:reseller-topup";

/**
 * The reseller's own "Account top-up" entry, kept apart from the regular menu so it is
 * easy to find. Opens the top-up flow directly (?topup=1).
 */
export function TopUpNavButton({
  variant,
  pending = 0,
  onNavigate,
}: {
  variant: "block" | "pill";
  pending?: number;
  onNavigate?: () => void;
}) {
  const t = useT();
  const pathname = usePathname();
  const onPage = pathname === "/premium/admin-recharge";

  return (
    <Link
      href={TOPUP_HREF}
      onClick={(e) => {
        if (onPage) {
          // Same page: Next keeps it mounted, so ask it to start the flow instead.
          e.preventDefault();
          window.dispatchEvent(new Event(TOPUP_EVENT));
        }
        onNavigate?.();
      }}
      aria-current={onPage ? "page" : undefined}
      className={clsx(
        "group relative flex shrink-0 items-center gap-2.5 font-semibold text-white outline-none transition",
        "bg-gradient-to-l from-blue-600 to-indigo-600 shadow-md shadow-blue-600/25 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98]",
        "focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950",
        variant === "block" ? "min-h-12 w-full rounded-xl px-3.5 text-sm" : "h-11 rounded-full px-4 text-sm",
      )}
    >
      <span
        className={clsx(
          "flex shrink-0 items-center justify-center rounded-lg bg-white/15",
          variant === "block" ? "h-8 w-8" : "h-7 w-7 rounded-full",
        )}
        aria-hidden
      >
        <Wallet size={variant === "block" ? 17 : 15} />
      </span>
      <span className="min-w-0 flex-1 truncate leading-tight">
        {t("nav.topUp")}
        {variant === "block" ? (
          <span className="block text-[11px] font-normal text-white/75">{t("nav.topUpHint")}</span>
        ) : null}
      </span>
      {pending > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950"
          title={t("nav.adminRechargePending", { count: pending })}
        >
          {pending > 99 ? "99+" : pending}
        </span>
      ) : null}
    </Link>
  );
}
