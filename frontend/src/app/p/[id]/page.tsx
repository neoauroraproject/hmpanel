"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import DefaultTheme from "./themes/DefaultTheme";
import CyberpunkTheme from "./themes/CyberpunkTheme";
import SunsetTheme from "./themes/SunsetTheme";
import MinimalistTheme from "./themes/MinimalistTheme";
import HackerTheme from "./themes/HackerTheme";
import NeoTheme, { type NeoVariant } from "./themes/NeoTheme";
import { Layers } from "lucide-react";

const NEO_THEMES = new Set<string>([
  "Neo Default",
  "Neo Vibrant",
  "Neo Eclipse",
  "Neo Glass",
  "Neo Minimal",
  "Neo Dashboard",
]);

export default function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["subscription", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}`);
      if (!res.ok) throw new Error("Failed to load subscription");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[100dvh] items-center justify-center bg-[#0a0a0c]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full min-h-[100dvh] flex-col items-center justify-center p-8 text-center bg-[#0a0a0c]">
        <Layers className="mb-4 text-zinc-600" size={64} />
        <h2 className="text-2xl font-bold text-white">Subscription Not Found</h2>
        <p className="mt-2 text-zinc-400">This link may be invalid, expired, or deleted.</p>
      </div>
    );
  }

  const currentTheme = data.portalSettings?.theme || "Dark";

  if (NEO_THEMES.has(currentTheme)) {
    return <NeoTheme id={id} data={data} variant={currentTheme as NeoVariant} />;
  }
  if (currentTheme === "Cyberpunk") return <CyberpunkTheme id={id} data={data} />;
  if (currentTheme === "Sunset") return <SunsetTheme id={id} data={data} />;
  if (currentTheme === "Minimalist") return <MinimalistTheme id={id} data={data} />;
  if (currentTheme === "Hacker") return <HackerTheme id={id} data={data} />;

  return <DefaultTheme params={params} />;
}
