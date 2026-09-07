"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9 shrink-0" />;

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-slate-600 outline-none transition-colors duration-200 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
