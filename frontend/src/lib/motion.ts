/**
 * Shared framer-motion presets for admin modals, pages, and lists.
 */
export const MOTION_CONFIG = {
  page: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: "easeOut" as const },
  },
  modalOverlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  modalContent: {
    initial: { opacity: 0, scale: 0.95, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 8 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  },
  sheetContent: {
    initial: { opacity: 0, y: "40%" },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: "30%" },
    transition: { type: "spring" as const, stiffness: 420, damping: 34 },
  },
  row: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.15 },
  },
  staggerContainer: {
    animate: { transition: { staggerChildren: 0.04 } },
  },
  staggerItem: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
  },
  tap: { scale: 0.98 },
  hover: { scale: 1.02 },
} as const;

/** Canonical admin modal shell classes (mobile-friendly). */
export const MODAL_SHELL =
  "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4";
export const MODAL_PANEL =
  "w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900";
