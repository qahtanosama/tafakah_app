// Standard two-part payment terms for the Sales Contract (clause 6).
// Pure module — shared by the PaymentTermsEditor (client) and the contract
// defaults (imported from server actions), so NO "use client" here.
//
// The stored value on terms.paymentTerms stays a plain string:
//   • 50% advance payment (deposit) upon signing of this contract / before shipment.
//   • 50% balance to be paid before arrival of the goods at Jeddah Port,
//     within 7–10 days (against copy of the Bill of Lading and shipping documents).

export const DEPOSIT_TIMINGS = [
  "upon signing of this contract / before shipment",
  "upon signing of this contract",
  "before shipment",
] as const;

export interface StandardPaymentTerms {
  advancePct: number;
  depositTiming: string;
  port: string;
  balanceDays: string;
}

export const DEFAULT_PAYMENT_TERMS: StandardPaymentTerms = {
  advancePct: 50,
  depositTiming: DEPOSIT_TIMINGS[0],
  port: "Jeddah Port",
  balanceDays: "7–10 days",
};

export function composePaymentTerms(t: StandardPaymentTerms): string {
  const balance = 100 - t.advancePct;
  return (
    `• ${t.advancePct}% advance payment (deposit) ${t.depositTiming}.\n` +
    `• ${balance}% balance to be paid before arrival of the goods at ${t.port}, ` +
    `within ${t.balanceDays} (against copy of the Bill of Lading and shipping documents).`
  );
}

const STANDARD_RE =
  /^•\s*(\d{1,3})%\s*advance payment \(deposit\)\s*([^\n]+?)\.\s*\n•\s*\d{1,3}%\s*balance to be paid before arrival of the goods at\s*(.+?),\s*within\s*(.+?)\s*\(against copy of the Bill of Lading and shipping documents\)\.?\s*$/;

/** Returns the structured fields when the string matches the standard wording, else null. */
export function parsePaymentTerms(value: string): StandardPaymentTerms | null {
  const m = value.trim().match(STANDARD_RE);
  if (!m) return null;
  const advancePct = parseInt(m[1], 10);
  if (!Number.isFinite(advancePct) || advancePct < 0 || advancePct > 100) return null;
  return { advancePct, depositTiming: m[2].trim(), port: m[3].trim(), balanceDays: m[4].trim() };
}

/** "JEDDAH PORT, SAUDI ARABIA" → "Jeddah Port" (first segment, title case). */
export function portFromDischarge(dischargePort: string): string {
  const first = dischargePort.split(",")[0]?.trim() ?? "";
  if (!first) return "";
  return first
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
