import api from "./api";

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
  password: string
): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>("/auth/token/", {
    username,
    password,
  });
  localStorage.setItem("access_token", data.access);
  localStorage.setItem("refresh_token", data.refresh);
  return data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/login";
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>("/accounts/users/me/");
  return data;
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("access_token");
}
