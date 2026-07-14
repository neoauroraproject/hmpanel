"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import CustomerDashboardPage from "../../../../portal/dashboard/page";
import { rememberStoreSlug } from "@/modules/storefront/store-slug";

/** Sticky store portal dashboard: /shop/{slug}/portal/dashboard */
export default function ShopScopedPortalDashboardPage() {
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => {
    rememberStoreSlug(slug);
  }, [slug]);

  return <CustomerDashboardPage />;
}
