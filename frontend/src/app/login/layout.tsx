import type { Metadata } from "next";
import { PANEL_METADATA } from "@/lib/panel-brand";

export const metadata: Metadata = PANEL_METADATA;

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
