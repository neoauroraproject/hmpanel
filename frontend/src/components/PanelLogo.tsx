import Image from "next/image";
import { PANEL_BRAND } from "@/lib/panel-brand";
import { clsx } from "clsx";

export function PanelLogo({
  size = 48,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={PANEL_BRAND.logoPath}
      alt={PANEL_BRAND.name}
      width={size}
      height={size}
      priority={priority}
      className={clsx("h-auto w-auto object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function PanelBootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950">
      <PanelLogo size={72} priority />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{PANEL_BRAND.name}</p>
    </div>
  );
}
