import type { Metadata } from "next";
import { headers } from "next/headers";

type PublicStoreMeta = {
  store?: {
    title?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    logoDarkUrl?: string | null;
    branding?: { name?: string | null; logo?: string | null; logoDark?: string | null } | null;
  } | null;
};

function absoluteUrl(path: string, origin: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const base = origin.replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export async function resolveRequestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
}

export async function fetchPublicStoreMeta(slug: string): Promise<PublicStoreMeta | null> {
  const origin = await resolveRequestOrigin();
  try {
    const res = await fetch(`${origin}/api/store/public/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicStoreMeta;
  } catch {
    return null;
  }
}

export async function fetchTrackMeta(code: string): Promise<{
  trackingCode?: string;
  storeTitle?: string | null;
  store?: { title?: string; slug?: string; logoUrl?: string | null } | null;
  branding?: { logo?: string | null } | null;
} | null> {
  const origin = await resolveRequestOrigin();
  try {
    const res = await fetch(`${origin}/api/store/track/${encodeURIComponent(code)}`, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function buildStoreMetadata(input: {
  title: string;
  description?: string | null;
  image?: string | null;
  path: string;
  origin: string;
}): Metadata {
  const title = input.title || "Store";
  const description =
    String(input.description || "").trim() ||
    `${title} — فروشگاه آنلاین`;
  const url = absoluteUrl(input.path, input.origin);
  const image = input.image ? absoluteUrl(input.image, input.origin) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: title,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export function storeMetaFromPayload(data: PublicStoreMeta | null, slug: string, origin: string): Metadata {
  const store = data?.store;
  const title = store?.title || store?.branding?.name || slug;
  const description = store?.description || null;
  const image =
    store?.logoUrl ||
    store?.logoDarkUrl ||
    store?.branding?.logo ||
    store?.branding?.logoDark ||
    null;
  return buildStoreMetadata({
    title,
    description,
    image,
    path: `/shop/${encodeURIComponent(slug)}`,
    origin,
  });
}
