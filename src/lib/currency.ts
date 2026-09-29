export const CURRENCIES = [
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "QAR", symbol: "﷼", name: "Qatari Riyal" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const STORAGE_KEY = "digix_currency";

export function getCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "PKR";
  return (localStorage.getItem(STORAGE_KEY) as CurrencyCode) || "PKR";
}

export function setCurrency(code: CurrencyCode) {
  localStorage.setItem(STORAGE_KEY, code);
  window.dispatchEvent(new Event("currency-change"));
}

export function formatCurrency(
  value: number | string | null | undefined,
  currencyCode?: CurrencyCode
): string {
  // A blank amount is one this person is not allowed to see, not a zero.
  // The server blanks them for anyone without view_prices, so every screen
  // that shows money now meets a null — and printing "PKR 0" would state a
  // figure that is not true. A dash says "not yours to see", which is what
  // happened. Calling .toLocaleString() on the null is what crashed
  // /finance outright for the store and the technicians.
  if (value === null || value === undefined || value === "") return "—";
  const code = currencyCode || getCurrency();
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return `${code} ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
