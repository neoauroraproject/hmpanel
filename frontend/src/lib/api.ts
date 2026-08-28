import axios from "axios";
import { isPublicAppPath } from "@/lib/public-paths";

export const API_BASE = "/api";
export const CUSTOMER_SESSION_STORAGE_KEY = "hm-storefront-session";

export const api = axios.create({ baseURL: API_BASE });
/** Unauthenticated / customer-session API client for public storefront. */
export const publicApi = axios.create({ baseURL: API_BASE });

export function getCustomerSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
}

export function setCustomerSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, token);
}

publicApi.interceptors.request.use((config) => {
  const session = getCustomerSessionToken();
  if (session && config.headers) {
    config.headers["x-customer-session"] = session;
  }
  return config;
});

/** Read the persisted auth state directly from the zustand-persisted localStorage blob. */
function getAuthState(): { token: string | null; refreshToken: string | null } {
  if (typeof window === "undefined") return { token: null, refreshToken: null };
  try {
    const raw = localStorage.getItem("panel-auth");
    if (!raw) return { token: null, refreshToken: null };
    const parsed = JSON.parse(raw)?.state;
    return { token: parsed?.token ?? null, refreshToken: parsed?.refreshToken ?? null };
  } catch {
    return { token: null, refreshToken: null };
  }
}

function clearAuthAndMaybeRedirectToLogin() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("panel-auth");
  // Public portals (/p, /shop, …) must stay usable for guests — never bounce them to /login.
  if (isPublicAppPath(window.location.pathname)) return;
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

api.interceptors.request.use((config) => {
  const { token } = getAuthState();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (err: any) => void }[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error?.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/refresh" || originalRequest.url === "/auth/login") {
        clearAuthAndMaybeRedirectToLogin();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers["Authorization"] = "Bearer " + token;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { refreshToken } = getAuthState();
      if (!refreshToken) {
        processQueue(error, null);
        clearAuthAndMaybeRedirectToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });

        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("panel-auth");
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.state.token = data.accessToken;
            parsed.state.refreshToken = data.refreshToken;
            localStorage.setItem("panel-auth", JSON.stringify(parsed));
          }
        }

        api.defaults.headers.common["Authorization"] = "Bearer " + data.accessToken;
        originalRequest.headers["Authorization"] = "Bearer " + data.accessToken;
        processQueue(null, data.accessToken);

        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        clearAuthAndMaybeRedirectToLogin();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    if (error?.response?.status === 403) {
      const msg = String(error?.response?.data?.message || "");
      if (/account disabled|account expired|session revoked/i.test(msg)) {
        clearAuthAndMaybeRedirectToLogin();
      }
    }

    return Promise.reject(error);
  },
);
