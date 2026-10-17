"use client";

import { PageHeader } from "@/components/ui";
import { ApiKeysPanel } from "@/components/ApiKeysPanel";
import { useT } from "@/i18n";

export default function ApiKeysPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("apiKeys.title")} subtitle={t("apiKeys.subtitle")} />
      <ApiKeysPanel />
    </>
  );
}
