// Client after-sales / arrival report for a contract. First client-written
// record type in the app — see supabase/migrations/20260613_120000_*.

export const ARRIVAL_CONDITIONS = ["good", "fair", "poor"] as const;
export type ArrivalCondition = (typeof ARRIVAL_CONDITIONS)[number];

export const ARRIVAL_ISSUE_TAGS = ["rot", "mould", "sprouting", "over-ripe"] as const;
export type ArrivalIssueTag = (typeof ARRIVAL_ISSUE_TAGS)[number];

/** Image types a client may attach as arrival photos. */
export const ARRIVAL_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
export const ARRIVAL_MAX_PHOTOS = 10;
export const ARRIVAL_MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB

export interface ArrivalReport {
  id: string;
  contractId: string;
  containerNumber: string | null;
  arrivalDate: string | null;
  damagedBoxes: number | null;
  totalBoxes: number | null;
  condition: ArrivalCondition | null;
  issueTags: string[];
  comments: string | null;
  photoPaths: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A report enriched with short-lived signed URLs for each stored photo. */
export interface ArrivalReportWithPhotos extends ArrivalReport {
  photos: { path: string; url: string }[];
}

export interface ArrivalReportRow {
  id: string;
  contract_id: string;
  container_number: string | null;
  arrival_date: string | null;
  damaged_boxes: number | null;
  total_boxes: number | null;
  condition: ArrivalCondition | null;
  issue_tags: unknown;
  comments: string | null;
  photo_paths: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function rowToArrivalReport(row: ArrivalReportRow): ArrivalReport {
  return {
    id: row.id,
    contractId: row.contract_id,
    containerNumber: row.container_number,
    arrivalDate: row.arrival_date,
    damagedBoxes: row.damaged_boxes,
    totalBoxes: row.total_boxes,
    condition: row.condition,
    issueTags: Array.isArray(row.issue_tags) ? (row.issue_tags as string[]) : [],
    comments: row.comments,
    photoPaths: Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
