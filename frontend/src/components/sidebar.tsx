"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Server,
  Wallet,
  LogOut,
  ShieldCheck,
  DatabaseBackup,
  Activity,
  Import,
  Settings,
  ArchiveX,
  Globe,
  Bell,
  Store,
  BarChart,
  Key,
  Diamond,
  ExternalLink
} from "lucide-react";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";

const CORE_NAV: {
  href: string;
  label: string;
  icon: typeof Users;
  roles?: Role[];
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admins", label: "Admins", icon: UserCog, roles: ["SUPER_ADMIN"] },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/panels", label: "Panels", icon: Server, roles: ["SUPER_ADMIN"] },
  { href: "/migration", label: "Migration", icon: Import, roles: ["SUPER_ADMIN"] },
  { href: "/traffic", label: "Traffic", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN"] },
];


const PREMIUM_MENU_ICONS: Record<string, typeof Diamond> = {
  branding: Diamond,
  "custom-domains": Globe,
  "client-templates": Diamond,
  store: Store,
  "monitoring-pro": Activity,
  "backup-center": DatabaseBackup,
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { licenseQuery } = useLicenseActivation();
  const dynamicMenus = usePluginRegistry((s) => s.menus);

  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";

  const { data: premiumModules = [] } = usePremiumModules({ enabled: isPremium });

  const coreItems = CORE_NAV.filter(
    (n) => !n.roles || (admin && n.roles.includes(admin.role))
  );

  const premiumMenus = isPremium
    ? [
        { title: "Premium Settings", href: "/settings/premium", icon: Diamond },
        ...dynamicMenus,
        ...premiumModules
          .filter((m) => m.enabled && m.status !== "disabled" && m.status !== "future" && m.id !== "job-center")
          .map((m) => ({
            title: m.name,
            href: m.frontendPath,
            icon: PREMIUM_MENU_ICONS[m.id] || Diamond,
          })),
      ].filter((menu, i, arr) => arr.findIndex((x) => x.href === menu.href) === i)
    : [];



  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
          <ShieldCheck size={18} />
        </div>
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">Panel</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <nav className="space-y-1 px-3">
          {coreItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {premiumMenus.length > 0 && (
          <>
            <div className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">
              Premium
            </div>
            <nav className="space-y-1 px-3 pb-2">
              {premiumMenus.map((menu) => {
                const href = menu.href;
                const title = menu.title;
                const Icon = menu.icon || Diamond;
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                    )}
                  >
                    <Icon size={18} />
                    {title}
                  </Link>
                );
              })}
            </nav>
          </>
        )}

      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 mt-auto">
        <div className="px-2 pb-2">
          <div className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {admin?.username}
          </div>
          <div className="text-xs text-zinc-500">
            {admin?.role === "SUPER_ADMIN" ? "Super Admin" : "Reseller"}
          </div>
        </div>

        {admin?.role === "SUPER_ADMIN" && (
          <div className="px-2 pb-2">
            <a 
              href="https://github.com/neoauroraproject/hmpanel" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <ExternalLink size={14} /> Official GitHub
            </a>
          </div>
        )}

        <div className="px-2 pb-2">
          <ThemeToggle />
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-red-400"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
