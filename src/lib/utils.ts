import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/** Today as a date input reads it — the local day, not the UTC one. */
export const todayIso = () => new Date().toLocaleDateString("en-CA");

/**
 * The earliest a deadline may be set to: today. A date already on the record
 * that has since passed may be kept, so editing something else on a late job
 * is not refused — but it cannot be moved further back.
 */
export const deadlineMin = (current?: string | null) =>
  current && current < todayIso() ? current : todayIso();

/** A warranty term the way it is quoted: "6 Months", "1 Year", "2 Years 6 Mo". */
export function formatTerm(months: number): string {
  if (months < 12) return `${months} Month${months !== 1 ? "s" : ""}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return `${years} Year${years > 1 ? "s" : ""}${rem ? ` ${rem} Mo` : ""}`;
}

/** The term between two dates: whole months when the end falls on the same
 *  day of the month ("1 Year", "6 Months"), otherwise the days ("394d"). */
export function termBetween(start?: string | null, end?: string | null, months?: number | null): string {
  if (!start || !end) return months ? formatTerm(months) : "—";
  const [sy, sm, sd] = start.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = end.slice(0, 10).split("-").map(Number);
  const whole = (ey - sy) * 12 + (em - sm);
  if (whole > 0 && sd === ed) return formatTerm(whole);
  const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
  return days > 0 ? `${days}d` : "—";
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
