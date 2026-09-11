"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import { useAuth } from "@/store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useT } from "@/i18n";
import { PanelBrandMark } from "@/components/PanelBrandMark";
import { useResellerShell } from "@/hooks/useResellerShell";
import { useAppNav } from "@/hooks/useAppNav";
import { NavSectionBlock } from "@/components/app-nav";

export function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { showGithub } = useResellerShell();
  const { sections, storeHasNewOrders, rechargePendingCount } = useAppNav();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 dark:border-zinc-800">
        <PanelBrandMark size={26} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-2.5 py-4" aria-label={t("nav.menu")}>
        {sections.map((section) => (
          <NavSectionBlock
            key={section.id}
            section={section}
            pathname={pathname}
            storeHasNewOrders={storeHasNewOrders}
            rechargePendingCount={rechargePendingCount}
            compact
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-2.5 border-t border-slate-200 p-3 dark:border-zinc-800">
        <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-zinc-900/80">
          <div className="truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">
            {admin?.username}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
            {admin?.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}
          </div>
          {showGithub ? (
            <Link
              href="https://github.com/neoauroraproject/hmpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 outline-none transition-colors duration-200 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-500 dark:hover:text-zinc-200"
            >
              <ExternalLink size={11} /> {t("nav.officialGithub")}
            </Link>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <LocaleSwitcher className="min-w-0 flex-1 justify-stretch [&>button]:min-h-8 [&>button]:flex-1" />
          <ThemeToggle />
        </div>

        <button
          type="button"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 outline-none transition-colors duration-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
        >
          <LogOut size={15} />
          {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}
