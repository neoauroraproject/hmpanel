"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { normalizePortalTheme } from "@/modules/shared/brand-logo";
import AuroraTheme from "./themes/AuroraTheme";
import ObsidianTheme from "./themes/ObsidianTheme";
import NordicTheme from "./themes/NordicTheme";
import PulseTheme from "./themes/PulseTheme";
import NeonTheme from "./themes/NeonTheme";
import EmberTheme from "./themes/EmberTheme";
import StudioTheme from "./themes/StudioTheme";

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
      <div className="flex h-full min-h-[100dvh] items-center justify-center bg-[#07101f]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-teal-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full min-h-[100dvh] flex-col items-center justify-center bg-[#07101f] p-8 text-center">
        <Layers className="mb-4 text-slate-600" size={64} />
        <h2 className="text-2xl font-bold text-white">Subscription Not Found</h2>
        <p className="mt-2 text-slate-400">This link may be invalid, expired, or deleted.</p>
      </div>
    );
  }

  const currentTheme = normalizePortalTheme(data.portalSettings?.theme);

  if (currentTheme === "Obsidian") return <ObsidianTheme id={id} data={data} />;
  if (currentTheme === "Nordic") return <NordicTheme id={id} data={data} />;
  if (currentTheme === "Pulse") return <PulseTheme id={id} data={data} />;
  if (currentTheme === "Neon") return <NeonTheme id={id} data={data} />;
  if (currentTheme === "Ember") return <EmberTheme id={id} data={data} />;
  if (currentTheme === "Studio") return <StudioTheme id={id} data={data} />;

  return <AuroraTheme id={id} data={data} />;
}
