import axios from "axios";

export const API_BASE = "/api";

export const api = axios.create({ baseURL: API_BASE });

/** Read the persisted auth state directly from the zustand-persisted localStorage blob. */
function getAuthState(): { token: string | null, refreshToken: string | null } {
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
        if (typeof window !== "undefined") {
          localStorage.removeItem("panel-auth");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
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
        if (typeof window !== "undefined") {
          localStorage.removeItem("panel-auth");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        
        // Update local storage
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
        if (typeof window !== "undefined") {
          localStorage.removeItem("panel-auth");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);
