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
  Diamond
} from "lucide-react";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { useLicense, PremiumFeature } from "@/hooks/useLicense";

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

const PREMIUM_NAV: {
  href: string;
  label: string;
  icon: typeof Users;
  roles?: Role[];
  premiumFeature?: PremiumFeature;
}[] = [
  { href: "/domains", label: "Domains", icon: Globe, roles: ["SUPER_ADMIN"], premiumFeature: "CUSTOM_DOMAINS" },
  { href: "/settings/portal", label: "Branding", icon: UserCog, roles: ["RESELLER", "SUPER_ADMIN"], premiumFeature: "WHITE_LABEL" },
  { href: "/settings/portal", label: "Portal Settings", icon: Settings, roles: ["SUPER_ADMIN", "RESELLER"] },
  { href: "/store/settings", label: "Store", icon: Store, roles: ["RESELLER", "SUPER_ADMIN"] },
  { href: "/backups", label: "Remote Backup", icon: DatabaseBackup, roles: ["SUPER_ADMIN"] },
  { href: "/alerts", label: "Alerts", icon: Bell, roles: ["SUPER_ADMIN"], premiumFeature: "SMART_ALERTS" },
  { href: "/pro/overview", label: "XRAY PRO", icon: Diamond, roles: ["SUPER_ADMIN"], premiumFeature: "XRAY_PRO" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);
  const { hasFeature, isLoading } = useLicense();

  const coreItems = CORE_NAV.filter(
    (n) => !n.roles || (admin && n.roles.includes(admin.role))
  );

  const isCommunity = process.env.NEXT_PUBLIC_RELEASE_MODE === 'COMMUNITY';

  const premiumItems = isCommunity ? [] : PREMIUM_NAV.filter(
    (n) => {
      const hasRole = !n.roles || (admin && n.roles.includes(admin.role));
      const hasLic = !n.premiumFeature || hasFeature(n.premiumFeature);
      return hasRole && (isLoading ? !n.premiumFeature : hasLic);
    }
  );

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
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-200",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        {premiumItems.length > 0 && (
          <div className="mt-6 px-3">
            <h4 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Premium</h4>
            <nav className="space-y-1">
              {premiumItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-900/50 hover:text-amber-500/80 dark:hover:text-amber-400/80",
                    )}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
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
        <div className="px-2 pb-2">
          <ThemeToggle />
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-white dark:hover:bg-zinc-900/50 hover:text-red-400"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
