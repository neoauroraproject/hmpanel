import type { Metadata } from "next";
import { PANEL_METADATA } from "@/lib/panel-brand";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = PANEL_METADATA;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
