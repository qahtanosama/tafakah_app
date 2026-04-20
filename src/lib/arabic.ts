/** Shared Arabic number formatters — used by Quote Calculator and Quick Share. */

const AR_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

export function toArabicNum(n: number, decimals = 0): string {
  const str = n.toFixed(decimals);
  return str
    .replace(/\d/g, (d) => AR_DIGITS[parseInt(d)])
    .replace(/\./g, "\u066B")
    .replace(/,/g, "\u066C");
}

export function toArabicFormatted(n: number, decimals = 0): string {
  const parts = n.toFixed(decimals).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const full = parts[1] ? `${intPart}.${parts[1]}` : intPart;
  return full
    .replace(/\d/g, (d) => AR_DIGITS[parseInt(d)])
    .replace(/\./g, "\u066B")
    .replace(/,/g, "\u066C");
}

/** Convert any Western digits in a string to Arabic-Indic digits (keeps non-digit chars). */
export function toArabicDigits(s: string): string {
  return s.replace(/\d/g, (d) => AR_DIGITS[parseInt(d)]);
}
