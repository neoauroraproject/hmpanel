"use client";

/** Scroll viewport (and optional container) to the top. */
export function scrollToTop(container?: HTMLElement | null) {
  if (typeof window === "undefined") return;
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
    if (container) container.scrollTop = 0;
  }
}
