import type { Metadata } from "next";
import ShopRouterClient from "./ShopRouterClient";
import {
  fetchPublicStoreMeta,
  resolveRequestOrigin,
  storeMetaFromPayload,
} from "@/modules/storefront/storefront-meta";

type Props = { params: Promise<{ slug: string }> | { slug: string } };

async function resolveSlug(params: Props["params"]) {
  const p = await Promise.resolve(params);
  return String(p.slug || "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await resolveSlug(params);
  const origin = await resolveRequestOrigin();
  const data = await fetchPublicStoreMeta(slug);
  return storeMetaFromPayload(data, slug, origin);
}

export default async function ShopPageEntry({ params }: Props) {
  await resolveSlug(params);
  return <ShopRouterClient />;
}
