/** Where the login lives in the browser.
 *
 *  Normally `localStorage`: one login per browser profile, shared by every
 *  tab and kept across restarts. Signing in "on this tab only" uses
 *  `sessionStorage` instead, which each tab keeps to itself - so several
 *  accounts can be open side by side in one browser (incognito windows
 *  share one profile, which is why they are no help for that). */

const KEYS = ["access_token", "refresh_token"] as const;
type Key = (typeof KEYS)[number];

function tabOnly(): boolean {
  try {
    return sessionStorage.getItem("access_token") !== null;
  } catch {
    return false;
  }
}

function store(): Storage {
  return tabOnly() ? sessionStorage : localStorage;
}

export function getToken(key: Key): string | null {
  if (typeof window === "undefined") return null;
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

export function saveTokens(access: string, refresh?: string, opts?: { tabOnly?: boolean }) {
  // A fresh sign-in picks the home; a refresh keeps the one in use.
  const target = opts?.tabOnly === undefined ? store() : opts.tabOnly ? sessionStorage : localStorage;
  if (opts?.tabOnly !== undefined) clearTokens();
  target.setItem("access_token", access);
  if (refresh) target.setItem("refresh_token", refresh);
}

export function clearTokens() {
  for (const key of KEYS) {
    try { sessionStorage.removeItem(key); } catch { /* blocked storage */ }
    try { localStorage.removeItem(key); } catch { /* blocked storage */ }
  }
}

/** True when this tab holds its own login rather than the browser's. */
export function isTabOnly(): boolean {
  return typeof window !== "undefined" && tabOnly();
}
