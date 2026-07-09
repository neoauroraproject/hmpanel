"use client";

import React from "react";
import { useParams } from "next/navigation";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { PageHeader, Card, ErrorBox } from "@/components/ui";

export default function PremiumPluginPage() {
  const params = useParams();
  const pluginPathSegments = params.plugin as string[];
  const pluginPath = `/${pluginPathSegments.join("/")}`;

  const route = usePluginRegistry((state) => state.routes[`/premium${pluginPath}`]);

  if (!route) {
    return (
      <div className="space-y-6">
        <PageHeader title="Premium Module" subtitle="Activate premium or refresh the page." />
        <Card className="p-8 text-center text-zinc-500">
          <ErrorBox message={`Premium module not loaded for /premium${pluginPath}. Check Settings → Premium License.`} />
        </Card>
      </div>
    );
  }

  const Component = route.component;
  return <Component />;
}
