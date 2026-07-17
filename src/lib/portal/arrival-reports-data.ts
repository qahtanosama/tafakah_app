import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowToArrivalReport,
  type ArrivalReportRow,
  type ArrivalReportWithPhotos,
} from "@/types/arrival-report";

const BUCKET = "contract-documents";
const SIGNED_URL_TTL = 3600; // 1h — long enough to view thumbnails on the page

/**
 * Loads a contract's arrival reports together with short-lived signed URLs for
 * each photo. RLS on contract_arrival_reports and on storage.objects scopes the
 * caller: a client only ever gets their own contract's reports/photos; team and
 * super_admin get all. The signed URLs come from the same RLS-scoped client, so
 * a client physically cannot mint a URL for another buyer's photo.
 *
 * Pass an authenticated (RLS-enforced) Supabase client — never the admin client
 * for the portal path. (Team pages may pass an explicitly-scoped client.)
 */
export async function loadArrivalReportsWithPhotos(
  supabase: SupabaseClient,
  contractId: string,
): Promise<ArrivalReportWithPhotos[]> {
  const { data, error } = await supabase
    .from("contract_arrival_reports")
    .select(
      "id, contract_id, container_number, arrival_date, damaged_boxes, total_boxes, condition, issue_tags, comments, photo_paths, created_by, created_at, updated_at",
    )
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const reports = (data as ArrivalReportRow[]).map(rowToArrivalReport);

  return Promise.all(
    reports.map(async (r): Promise<ArrivalReportWithPhotos> => {
      const photos = await Promise.all(
        r.photoPaths.map(async (path) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, SIGNED_URL_TTL);
          return signed?.signedUrl ? { path, url: signed.signedUrl } : null;
        }),
      );
      return { ...r, photos: photos.filter((p): p is { path: string; url: string } => p !== null) };
    }),
  );
}
