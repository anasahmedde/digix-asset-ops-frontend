import axios from "axios";

import { clearTokens, getToken, saveTokens } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getToken("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl: string = originalRequest?.url || "";

    const isAuthEndpoint =
      requestUrl.includes("/auth/token") ||
      requestUrl.includes("/auth/token/refresh");

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getToken("refresh_token");

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          saveTokens(data.access, data.refresh);
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
          return api(originalRequest);
        } catch {
          clearTokens();
          window.location.href = "/login";
        }
      } else {
        clearTokens();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
