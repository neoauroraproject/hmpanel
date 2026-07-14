"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import PortalEntryPage from "../../../portal/page";
import { rememberStoreSlug } from "@/modules/storefront/store-slug";

/** Sticky store portal login: /shop/{slug}/portal */
export default function ShopScopedPortalPage() {
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => {
    rememberStoreSlug(slug);
  }, [slug]);

  return <PortalEntryPage />;
}
