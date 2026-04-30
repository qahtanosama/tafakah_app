export type AppLocale = "en" | "ar";

const intlLocale = (l: AppLocale) => (l === "ar" ? "ar-SA" : "en-US");
const numberingSystem = (l: AppLocale) => "latn"; // Always use Western numerals (1, 2, 3)

export function formatCurrency(amount: number, locale: AppLocale, currency: string = "USD"): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    numberingSystem: numberingSystem(locale),
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, locale: AppLocale, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    numberingSystem: numberingSystem(locale),
    ...opts,
  }).format(value);
}

export function formatDate(date: Date | string | null | undefined, locale: AppLocale): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    numberingSystem: numberingSystem(locale),
  }).format(d);
}
