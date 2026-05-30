"use client";

import { resolveStatus } from "@/lib/shipping";
import { useAllShipping, shippingRowToEntry } from "@/lib/data/shipping";
import type { ShippingStatus } from "@/types/shipping";

export default function ShippingCardSummary() {
  const { data: shippingByCid } = useAllShipping();

  if (!shippingByCid) return null;

  const counts: Record<ShippingStatus, number> = {
    not_scheduled: 0, pending: 0, at_sea: 0, delivered: 0, delayed: 0, cancelled: 0,
  };
  for (const cid of Object.keys(shippingByCid)) {
    const entry = shippingRowToEntry("", shippingByCid[cid]);
    counts[resolveStatus(entry)]++;
  }
  const summary = { atSea: counts.at_sea, pending: counts.pending, delayed: counts.delayed };

  if (summary.atSea === 0 && summary.pending === 0 && summary.delayed === 0) return null;

  const parts: string[] = [];
  if (summary.atSea > 0) parts.push(`${summary.atSea} at sea`);
  if (summary.pending > 0) parts.push(`${summary.pending} pending`);
  if (summary.delayed > 0) parts.push(`${summary.delayed} delayed`);

  return (
    <p className={`mt-2 text-xs font-medium ${summary.delayed > 0 ? "text-red-600" : "text-blue-600"}`}>
      {parts.join(" · ")}
    </p>
  );
}
