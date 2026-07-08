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

export function formatCurrency(value: number | string, currencyCode?: CurrencyCode): string {
  const code = currencyCode || getCurrency();
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return `${code} 0`;
  return `${code} ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
