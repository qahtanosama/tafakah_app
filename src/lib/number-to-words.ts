const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];

const TENS = [
  "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
];

function chunk(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    return o ? `${t} ${o}` : t;
  }
  const h = ONES[Math.floor(n / 100)] + " HUNDRED";
  const rem = n % 100;
  return rem ? `${h} ${chunk(rem)}` : h;
}

export function intToWords(n: number): string {
  const whole = Math.floor(Math.abs(n));
  if (whole === 0) return "ZERO";
  const parts: string[] = [];
  let remaining = whole;
  if (remaining >= 1_000_000) {
    parts.push(chunk(Math.floor(remaining / 1_000_000)) + " MILLION");
    remaining %= 1_000_000;
  }
  if (remaining >= 1_000) {
    parts.push(chunk(Math.floor(remaining / 1_000)) + " THOUSAND");
    remaining %= 1_000;
  }
  if (remaining > 0) parts.push(chunk(remaining));
  return parts.join(" ");
}

export function numberToWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const dollars = Math.floor(rounded);
  const cents = Math.round((rounded - dollars) * 100);

  if (dollars === 0 && cents === 0) return "ZERO US DOLLARS ONLY";

  const parts: string[] = [];
  let remaining = dollars;

  if (remaining >= 1_000_000) {
    const millions = Math.floor(remaining / 1_000_000);
    parts.push(chunk(millions) + " MILLION");
    remaining %= 1_000_000;
  }

  if (remaining >= 1_000) {
    const thousands = Math.floor(remaining / 1_000);
    parts.push(chunk(thousands) + " THOUSAND");
    remaining %= 1_000;
  }

  if (remaining > 0) {
    parts.push(chunk(remaining));
  }

  let result = parts.join(" ") + " US DOLLARS";

  if (cents > 0) {
    result += " AND " + chunk(cents) + " CENTS";
  }

  return result + " ONLY";
}
