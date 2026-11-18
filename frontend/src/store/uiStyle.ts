import { create } from "zustand";
import {
  FALLBACK_UI_NAV,
  FALLBACK_UI_STYLE,
  readCachedUiDefault,
  readPersonalUi,
  writeCachedUiDefault,
  writePersonalUi,
  type UiNav,
  type UiStyle,
} from "@/lib/ui-style";

interface UiStyleState {
  /** False until the browser storage has been read (first client effect). */
  hydrated: boolean;
  personalStyle: UiStyle | null;
  personalNav: UiNav | null;
  defaultStyle: UiStyle;
  defaultNav: UiNav;
  hydrate: () => void;
  setPersonal: (next: { style?: UiStyle | null; nav?: UiNav | null }) => void;
  setPanelDefault: (style: UiStyle, nav: UiNav) => void;
}

export const useUiStyleStore = create<UiStyleState>()((set, get) => ({
  hydrated: false,
  personalStyle: null,
  personalNav: null,
  defaultStyle: FALLBACK_UI_STYLE,
  defaultNav: FALLBACK_UI_NAV,
  hydrate: () => {
    if (get().hydrated) return;
    const personal = readPersonalUi();
    const cached = readCachedUiDefault();
    set({
      hydrated: true,
      personalStyle: personal.style,
      personalNav: personal.nav,
      defaultStyle: cached.style ?? FALLBACK_UI_STYLE,
      defaultNav: cached.nav ?? FALLBACK_UI_NAV,
    });
  },
  setPersonal: (next) => {
    const style = next.style !== undefined ? next.style : get().personalStyle;
    const nav = next.nav !== undefined ? next.nav : get().personalNav;
    writePersonalUi(style, nav);
    set({ personalStyle: style, personalNav: nav });
  },
  setPanelDefault: (style, nav) => {
    writeCachedUiDefault(style, nav);
    set({ defaultStyle: style, defaultNav: nav });
  },
}));

/** Effective look: the user's own choice wins over the panel-wide default. */
export function useUiStyle(): { style: UiStyle; nav: UiNav; modern: boolean; hydrated: boolean } {
  const hydrated = useUiStyleStore((s) => s.hydrated);
  const style = useUiStyleStore((s) => s.personalStyle ?? s.defaultStyle);
  const nav = useUiStyleStore((s) => s.personalNav ?? s.defaultNav);
  return { style, nav, modern: style === "modern", hydrated };
}
