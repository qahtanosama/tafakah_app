/**
 * Arabic-Indic numeral formatters — used by Quick Share templates.
 *
 * Not every Arabic surface wants these: the buyer portal and the Quote
 * Calculator both render Arabic text with Western digits (see the
 * `numberingSystem` note in lib/i18n/format.ts), because traders read prices in
 * Latin numerals and mixed-script figures invite transcription errors.
 */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toArabicFormatted(n: number, decimals = 0): string {
  const parts = n.toFixed(decimals).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const full = parts[1] ? `${intPart}.${parts[1]}` : intPart;
  return full
    .replace(/\d/g, (d) => AR_DIGITS[parseInt(d)])
    .replace(/\./g, "٫")
    .replace(/,/g, "٬");
}

/** Convert any Western digits in a string to Arabic-Indic digits (keeps non-digit chars). */
export function toArabicDigits(s: string): string {
  return s.replace(/\d/g, (d) => AR_DIGITS[parseInt(d)]);
}
