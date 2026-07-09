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
  ArchiveX,
  Menu,
  X,
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



export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const admin = useAuth((s) => s.admin);
  const logout = useAuth((s) => s.logout);

  const coreItems = CORE_NAV.filter(
    (n) => !n.roles || (admin && n.roles.includes(admin.role))
  );



  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white px-4 dark:bg-zinc-950 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
            <ShieldCheck size={18} />
          </div>
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">Panel</span>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          <Menu size={24} />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm md:hidden">
          <div className="w-64 max-w-sm flex-col bg-white dark:bg-zinc-950 flex h-full">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">Menu</span>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                      )}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  );
                })}
              </nav>


            </div>

            <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 mt-auto">
              <div className="mb-4 flex items-center justify-between px-2">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {admin?.username}
                </div>
                <ThemeToggle />
              </div>
              <button
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
      )}
    </>
  );
}
