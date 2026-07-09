"use client";

import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { usePremiumModules } from "@/hooks/usePremiumModules";
import { PageHeader, Card, Spinner } from "@/components/ui";
import Link from "next/link";
import { Diamond, ChevronRight } from "lucide-react";

export default function PremiumSettingsPage() {
  const { licenseQuery } = useLicenseActivation();
  const state = licenseQuery.data;

  const isPremium =
    state?.edition === "PREMIUM" &&
    state?.status !== "community" &&
    state?.mode !== "disabled";

  const { data: modules, isLoading } = usePremiumModules({ enabled: isPremium });

  if (licenseQuery.isLoading) return <Spinner />;

  if (!isPremium) {
    return (
      <div className="space-y-6">
        <PageHeader title="Premium Settings" subtitle="Premium license required" />
        <Card className="p-6 text-sm text-zinc-500">
          Activate your premium license under Global Settings → Premium License.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Premium Settings" subtitle="Manage premium modules" />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3">
          {(modules || []).map((mod) => (
            <Link key={mod.id} href={mod.frontendPath}>
              <Card className="p-4 flex items-center justify-between hover:border-emerald-500/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Diamond size={18} className="text-emerald-500" />
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-100">{mod.name}</p>
                    <p className="text-xs text-zinc-500">{mod.description}</p>
                  </div>
                </div>
                <ChevronRight className="text-zinc-400" size={18} />
              </Card>
            </Link>
          ))}
          {!modules?.length && (
            <Card className="p-6 text-sm text-zinc-500">
              Premium modules are loading. If this persists, restart the panel service and refresh.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
