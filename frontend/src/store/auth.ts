import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionAdmin } from "@/lib/types";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  admin: SessionAdmin | null;
  setAuth: (token: string, refreshToken: string, admin: SessionAdmin) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setAdmin: (admin: SessionAdmin) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      admin: null,
      setAuth: (token, refreshToken, admin) => set({ token, refreshToken, admin }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setAdmin: (admin) => set({ admin }),
      logout: () => set({ token: null, refreshToken: null, admin: null }),
    }),
    { name: "panel-auth" },
  ),
);

/** Safe on SSR/prerender — `persist` is missing until the client store hydrates. */
export function subscribeAuthHydration(onHydrated: () => void): () => void {
  const persistApi = (
    useAuth as {
      persist?: {
        hasHydrated?: () => boolean;
        onFinishHydration?: (cb: () => void) => () => void;
      };
    }
  ).persist;
  if (!persistApi?.hasHydrated) {
    onHydrated();
    return () => undefined;
  }
  if (persistApi.hasHydrated()) {
    onHydrated();
    return () => undefined;
  }
  return persistApi.onFinishHydration?.(onHydrated) || (() => undefined);
}
