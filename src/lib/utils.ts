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

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
