"use client";

import { useState } from "react";
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
  Menu,
  X,
  Globe,
  Store,
  Diamond,
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

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
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
    (n) => !n.roles || (admin && n.roles.includes(admin.role)),
  );

  const premiumMenus = isPremium
    ? [
        ...(admin?.role === "SUPER_ADMIN"
          ? [{ title: "Premium Settings", href: "/settings/premium", icon: Diamond }]
          : []),
        ...(admin?.role === "SUPER_ADMIN" ? dynamicMenus : []),
        ...premiumModules
          .filter((m) => {
            if (m.status === "disabled" || m.status === "future" || m.id === "job-center") {
              return false;
            }
            if (!m.enabled) return false;
            if (admin?.role === "SUPER_ADMIN") return true;
            return m.kind === "BUSINESS";
          })
          .map((m) => ({
            title: m.name,
            href: m.frontendPath,
            icon: PREMIUM_MENU_ICONS[m.id] || Diamond,
          })),
      ].filter((menu, i, arr) => arr.findIndex((x) => x.href === menu.href) === i)
    : [];

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
            <ShieldCheck size={18} />
          </div>
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">Panel</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm md:hidden">
          <div className="flex h-full w-64 max-w-sm flex-col bg-white dark:bg-zinc-950">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">Menu</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <nav className="space-y-1 px-3">
                {coreItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                      )}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              {premiumMenus.length > 0 ? (
                <>
                  <div className="px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">
                    Premium
                  </div>
                  <nav className="space-y-1 px-3 pb-2">
                    {premiumMenus.map((menu) => {
                      const Icon = menu.icon || Diamond;
                      const active = pathname.startsWith(menu.href);
                      return (
                        <Link
                          key={menu.href}
                          href={menu.href}
                          onClick={() => setIsOpen(false)}
                          className={clsx(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                          )}
                        >
                          <Icon size={18} />
                          {menu.title}
                        </Link>
                      );
                    })}
                  </nav>
                </>
              ) : null}
            </div>

            <div className="mt-auto border-t border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-4 flex items-center justify-between px-2">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {admin?.username}
                </div>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  logout();
                  router.replace("/login");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
