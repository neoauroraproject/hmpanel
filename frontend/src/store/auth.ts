import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionAdmin } from "@/lib/types";

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  admin: SessionAdmin | null;
  setAuth: (token: string, refreshToken: string, admin: SessionAdmin) => void;
  setTokens: (token: string, refreshToken: string) => void;
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
      logout: () => set({ token: null, refreshToken: null, admin: null }),
    }),
    { name: "panel-auth" },
  ),
);
