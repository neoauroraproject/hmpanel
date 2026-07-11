import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Apex `/` routing:
 * - Custom domain → always rewrite/redirect to that admin's shop
 * - Premium main domain: left to client page.tsx (needs localStorage auth —
 *   guests → /shop/{slug}, logged-in → /dashboard)
 *
 * /login, /dashboard, /premium/*, /api, /s, /shop stay available as direct paths.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.next();
  }

  const host = request.headers.get("host") || "";
  try {
    const url = new URL("/api/public/domains/resolve", request.nextUrl.origin);
    url.searchParams.set("host", host);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.next();
    const data = (await res.json()) as {
      matched?: boolean;
      storefrontPath?: string | null;
      source?: string;
    };
    // Only force-redirect custom domains here (no auth cookie available on edge).
    if (data?.matched && data.storefrontPath && data.source === "custom-domain") {
      return NextResponse.redirect(new URL(data.storefrontPath, request.nextUrl.origin));
    }
  } catch {
    /* fall through */
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
