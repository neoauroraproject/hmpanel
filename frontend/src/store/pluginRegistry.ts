import { create } from "zustand";

export interface PluginMenu {
  title: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  isPremium?: boolean;
  moduleId?: string;
}

export interface PluginRoute {
  path: string;
  component: React.ComponentType<Record<string, unknown>>;
}

export interface PluginSlotComponent {
  component: React.ComponentType<Record<string, unknown>>;
  order?: number;
}

interface PluginRegistryState {
  menus: PluginMenu[];
  routes: Record<string, PluginRoute>;
  slots: Record<string, PluginSlotComponent[]>;
  registerMenu: (menu: PluginMenu) => void;
  registerRoute: (route: PluginRoute) => void;
  registerSlot: (slotName: string, component: PluginSlotComponent) => void;
  unregisterAll: () => void;
}

export const usePluginRegistry = create<PluginRegistryState>((set) => ({
  menus: [],
  routes: {},
  slots: {},

  registerMenu: (menu) =>
    set((state) => ({ menus: [...state.menus, menu] })),

  registerRoute: (route) =>
    set((state) => ({ routes: { ...state.routes, [route.path]: route } })),

  registerSlot: (slotName, component) =>
    set((state) => {
      const existing = state.slots[slotName] || [];
      return {
        slots: {
          ...state.slots,
          [slotName]: [...existing, component].sort(
            (a, b) => (a.order || 0) - (b.order || 0),
          ),
        },
      };
    }),

  unregisterAll: () => set({ menus: [], routes: {}, slots: {} }),
}));
