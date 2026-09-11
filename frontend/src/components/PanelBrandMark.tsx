"use client";

import { PanelLogo } from "@/components/PanelLogo";
import { useResellerShell } from "@/hooks/useResellerShell";

export function PanelBrandMark({ size = 26 }: { size?: number }) {
  const { name, logoSrc, isCustomLogo } = useResellerShell();
  return (
    <>
      {isCustomLogo ? (
        <img
          src={logoSrc}
          alt={name}
          width={size}
          height={size}
          className="h-auto w-auto object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <PanelLogo size={size} />
      )}
      <span className="truncate text-sm font-semibold tracking-tight text-slate-800 dark:text-zinc-100">
        {name}
      </span>
    </>
  );
}
