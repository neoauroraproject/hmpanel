"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { PageHeader } from "@/components/ui";

const TABS = [
  { href: "/pro/overview", label: "Overview" },
  { href: "/pro/metrics", label: "Live Metrics" },
  { href: "/pro/incidents", label: "Incidents" },
  { href: "/pro/operations", label: "Operations" },
  { href: "/pro/backups", label: "Backups" },
  { href: "/pro/alerts", label: "Alerts" },
  { href: "/pro/maintenance", label: "Maintenance" },
];

export default function ProLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="XRAY PRO Operations Center" 
        subtitle="Advanced multi-panel management, incidents, and remote operations." 
      />

      <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg overflow-x-auto whitespace-nowrap hide-scrollbar">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                active
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="pt-2">
        {children}
      </div>
    </div>
  );
}
