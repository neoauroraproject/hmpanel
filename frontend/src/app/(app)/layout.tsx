import type { Metadata, Viewport } from "next";
import { PANEL_METADATA, PANEL_VIEWPORT } from "@/lib/panel-brand";
import { AppShell } from "@/components/AppShell";
import { PwaHead } from "@/components/pwa/PwaHead";
import { UI_STYLE_BOOT_SCRIPT } from "@/lib/ui-style";

export const metadata: Metadata = PANEL_METADATA;
export const viewport: Viewport = PANEL_VIEWPORT;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: UI_STYLE_BOOT_SCRIPT }} />
      <PwaHead />
      <AppShell>{children}</AppShell>
    </>
  );
}
