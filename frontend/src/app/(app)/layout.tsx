"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Toaster } from "@/components/toast";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [ready, setReady] = useState(false);

  const pathname = usePathname();

  // Auth guard — zustand reads from localStorage after mount, so wait a tick.
  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    } 

    const isCommunity = process.env.NEXT_PUBLIC_RELEASE_MODE === 'COMMUNITY';
    const premiumRoutes = ['/domains', '/store', '/pro', '/backups', '/alerts', '/analytics', '/settings/license'];
    const isPremiumRoute = premiumRoutes.some(r => pathname.startsWith(r));

    if (isCommunity && isPremiumRoute) {
      router.replace("/dashboard");
      return;
    }

    setReady(true);
  }, [token, router, pathname]);

  if (!ready) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <MobileNav />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-8 md:pb-8 relative">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
