"use client";

import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import ShopPage from "./ShopPageClient";

export default function ShopPageEntry() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <LoaderCircle className="animate-spin text-zinc-500" />
        </div>
      }
    >
      <ShopPage />
    </Suspense>
  );
}
