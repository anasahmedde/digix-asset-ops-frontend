import api from "./api";
import { clearTokens, getToken, saveTokens } from "./token-store";

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone: string;
  avatar: string | null;
  is_field_staff: boolean;
}

export async function login(
  username: string,
  password: string,
  opts: { tabOnly?: boolean } = {},
): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>("/auth/token/", {
    username,
    password,
  });
  saveTokens(data.access, data.refresh, { tabOnly: !!opts.tabOnly });
  return data;
}

export function logout() {
  clearTokens();
  // Leaving here leaves DIGIX Suite too, so the next person on this browser
  // does not find Suite still signed in as you.
  const suite = process.env.NEXT_PUBLIC_SUITE_URL;
  if (suite) fetch(`${suite}/sso/logout`, { mode: "no-cors", credentials: "include", keepalive: true }).catch(() => {});
  window.location.href = "/login";
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>("/accounts/users/me/");
  return data;
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!getToken("access_token");
}
