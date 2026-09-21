"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { normalizePortalTheme } from "@/modules/shared/brand-logo";
import AuroraTheme from "./themes/AuroraTheme";
import DefaultTheme from "./themes/DefaultTheme";
import EclipseTheme from "./themes/EclipseTheme";
import SunsetTheme from "./themes/SunsetTheme";
import GlassTheme from "./themes/GlassTheme";
import VibrantTheme from "./themes/VibrantTheme";
import PaygSubPortal, { type PaygSubPortalPayload } from "./themes/PaygSubPortal";

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

  const { data: payg, isFetched: paygFetched } = useQuery({
    queryKey: ["payg-sub-portal", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/store/payg-sub/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const json = (await res.json()) as PaygSubPortalPayload | null;
      return json?.payg ? json : null;
    },
    retry: false,
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data?.payg) return false;
      return String(data.plan?.billingMode || "").toUpperCase() === "VOLUME" ? 10_000 : 30_000;
    },
  });

  if (isLoading || !paygFetched) {
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

  if (payg?.payg) {
    return <PaygSubPortal id={id} data={data} payg={payg} />;
  }

  const currentTheme = normalizePortalTheme(data.portalSettings?.theme);

  if (currentTheme === "Dark" || currentTheme === "Light") return <DefaultTheme id={id} data={data} />;
  if (currentTheme === "Eclipse") return <EclipseTheme id={id} data={data} />;
  if (currentTheme === "Sunset") return <SunsetTheme id={id} data={data} />;
  if (currentTheme === "Glass") return <GlassTheme id={id} data={data} />;
  if (currentTheme === "Vibrant") return <VibrantTheme id={id} data={data} />;

  return <AuroraTheme id={id} data={data} />;
}
