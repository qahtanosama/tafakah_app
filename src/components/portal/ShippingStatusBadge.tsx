"use client";

import { getStatusInfo } from "@/lib/shipping";
import type { ShippingEntry, ShippingStatusOverride } from "@/types/shipping";

interface Props {
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  statusOverride?: string | null;
  className?: string;
}

/**
 * Shipping status badge for the client portal. Reuses the team's
 * `getStatusInfo()` VERBATIM (single source of truth) so the client sees exactly
 * the same status the team does — Not Scheduled / Pending Departure / At Sea /
 * Delivered / Delayed / Cancelled — with identical colors. Read-only.
 *
 * `getStatusInfo` only reads atd/etd/ata/eta/statusOverride off the entry, so we
 * hand it a minimal object shaped like a ShippingEntry (no extra columns needed,
 * keeping the portal SELECTs lean).
 */
export default function ShippingStatusBadge({
  etd,
  atd,
  eta,
  ata,
  statusOverride,
  className,
}: Props) {
  const entry = {
    etd: etd ?? "",
    atd: atd ?? null,
    eta: eta ?? "",
    ata: ata ?? null,
    statusOverride: (statusOverride ?? "auto") as ShippingStatusOverride,
  } as unknown as ShippingEntry;

  const info = getStatusInfo(entry);

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${info.badgeColor}${
        className ? ` ${className}` : ""
      }`}
      title={info.daysLabel !== "—" ? info.daysLabel : undefined}
    >
      <span aria-hidden>{info.icon}</span>
      {info.label}
    </span>
  );
}
