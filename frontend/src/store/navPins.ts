import { create } from "zustand";
import { MAX_PINS } from "@/lib/nav-config";

const KEY = "hmpanel-nav-pins";

function read(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, MAX_PINS) : null;
  } catch {
    return null;
  }
}

function write(pins: string[] | null) {
  try {
    if (pins) localStorage.setItem(KEY, JSON.stringify(pins));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the choice simply is not remembered */
  }
}

interface NavPinsState {
  hydrated: boolean;
  /** null = use the default for this panel (Premium or Community). */
  pins: string[] | null;
  hydrate: () => void;
  setPins: (pins: string[] | null) => void;
}

/** Which pages sit directly in the top bar. Per browser, like the appearance choice. */
export const useNavPins = create<NavPinsState>()((set, get) => ({
  hydrated: false,
  pins: null,
  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true, pins: read() });
  },
  setPins: (pins) => {
    const next = pins ? pins.slice(0, MAX_PINS) : null;
    write(next);
    set({ pins: next });
  },
}));
