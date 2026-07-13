"use client";

import { scrollToTop } from "../scroll";

/** Scroll the Mini App viewport (and optional container) to the top. */
export function scrollTmaToTop(container?: HTMLElement | null) {
  scrollToTop(container);
}
