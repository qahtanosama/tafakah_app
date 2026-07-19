// Sailing schedules (published by the team from the weekly carrier Excel) and
// client loading plans — see supabase/migrations/20260719_120000_*.

export const SAILING_STATUSES = ["open", "closed", "departed", "cancelled"] as const;
export type SailingStatus = (typeof SAILING_STATUSES)[number];

export const LOADING_PLAN_STATUSES = [
  "submitted",
  "confirmed",
  "booked",
  "declined",
  "cancelled",
] as const;
export type LoadingPlanStatus = (typeof LOADING_PLAN_STATUSES)[number];

/** Loading-plan statuses the TEAM may set from the inbox (client owns the rest). */
export const TEAM_SETTABLE_PLAN_STATUSES = ["submitted", "confirmed", "booked", "declined"] as const;

export interface SailingSchedule {
  id: string;
  shippingLine: string;
  vessel: string;
  voyage: string | null;
  portOfLoading: string | null;
  destination: string | null;
  etd: string | null;
  eta: string | null;
  cargoCutoff: string | null;
  docCutoff: string | null;
  transitDays: number | null;
  commodity: string | null;
  notes: string | null;
  status: SailingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Team-only fields (freight rates etc.) from sailing_schedule_internal. */
export interface SailingInternal {
  oceanFreight: string | null;
  bookingPlan: string | null;
  spaceReleaseStatus: string | null;
  remark: string | null;
}

export interface SailingScheduleWithInternal extends SailingSchedule {
  internal: SailingInternal | null;
}

export interface SailingScheduleRow {
  id: string;
  shipping_line: string;
  vessel: string;
  voyage: string | null;
  port_of_loading: string | null;
  destination: string | null;
  etd: string | null;
  eta: string | null;
  cargo_cutoff: string | null;
  doc_cutoff: string | null;
  transit_days: number | null;
  commodity: string | null;
  notes: string | null;
  status: SailingStatus;
  created_at: string;
  updated_at: string;
}

export interface SailingInternalRow {
  ocean_freight: string | null;
  booking_plan: string | null;
  space_release_status: string | null;
  remark: string | null;
}

export function rowToSailing(row: SailingScheduleRow): SailingSchedule {
  return {
    id: row.id,
    shippingLine: row.shipping_line,
    vessel: row.vessel,
    voyage: row.voyage,
    portOfLoading: row.port_of_loading,
    destination: row.destination,
    etd: row.etd,
    eta: row.eta,
    cargoCutoff: row.cargo_cutoff,
    docCutoff: row.doc_cutoff,
    transitDays: row.transit_days,
    commodity: row.commodity,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToInternal(row: SailingInternalRow | null): SailingInternal | null {
  if (!row) return null;
  return {
    oceanFreight: row.ocean_freight,
    bookingPlan: row.booking_plan,
    spaceReleaseStatus: row.space_release_status,
    remark: row.remark,
  };
}

/** One parsed row from the uploaded Excel sheet, ready to import. */
export interface SailingInput {
  shippingLine: string;
  vessel: string;
  voyage: string | null;
  portOfLoading: string | null;
  destination: string | null;
  etd: string | null;
  eta: string | null;
  cargoCutoff: string | null;
  docCutoff: string | null;
  transitDays: number | null;
  commodity: string | null;
  /** Team-authored, client-visible. Never populated from the sheet. */
  notes: string | null;
  // Internal (team-only) sheet fields → sailing_schedule_internal.
  oceanFreight: string | null;
  bookingPlan: string | null;
  spaceRelease: string | null;
  remark: string | null;
}

export interface LoadingPlan {
  id: string;
  scheduleId: string;
  buyerId: string;
  contractId: string | null;
  containers: number | null;
  quantity: string | null;
  cargoReadyDate: string | null;
  notes: string | null;
  status: LoadingPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoadingPlanRow {
  id: string;
  schedule_id: string;
  buyer_id: string;
  contract_id: string | null;
  containers: number | null;
  quantity: string | null;
  cargo_ready_date: string | null;
  notes: string | null;
  status: LoadingPlanStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function rowToLoadingPlan(row: LoadingPlanRow): LoadingPlan {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    buyerId: row.buyer_id,
    contractId: row.contract_id,
    containers: row.containers,
    quantity: row.quantity,
    cargoReadyDate: row.cargo_ready_date,
    notes: row.notes,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Team inbox view: a plan joined with its buyer and sailing. */
export interface LoadingPlanWithContext extends LoadingPlan {
  buyerName: string | null;
  sailing: Pick<SailingSchedule, "shippingLine" | "vessel" | "voyage" | "etd" | "status"> | null;
}
