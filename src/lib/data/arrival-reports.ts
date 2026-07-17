"use client";

/**
 * Client-side read of contract_arrival_reports for the team UI.
 *
 * Uses the authed browser client (RLS-scoped) — team/super_admin see every
 * contract's reports, a client only their own. Photo signed URLs are minted
 * through the same RLS-scoped client.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  rowToArrivalReport,
  type ArrivalReportRow,
  type ArrivalReportWithPhotos,
} from "@/types/arrival-report";

const BUCKET = "contract-documents";

export function useArrivalReports(contractId: string | undefined) {
  return useQuery<ArrivalReportWithPhotos[]>({
    queryKey: ["arrival_reports", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contract_arrival_reports")
        .select(
          "id, contract_id, container_number, arrival_date, damaged_boxes, total_boxes, condition, issue_tags, comments, photo_paths, created_by, created_at, updated_at",
        )
        .eq("contract_id", contractId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const reports = ((data as ArrivalReportRow[]) ?? []).map(rowToArrivalReport);
      return Promise.all(
        reports.map(async (r): Promise<ArrivalReportWithPhotos> => {
          const photos = await Promise.all(
            r.photoPaths.map(async (path) => {
              const { data: signed } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(path, 3600);
              return signed?.signedUrl ? { path, url: signed.signedUrl } : null;
            }),
          );
          return {
            ...r,
            photos: photos.filter((p): p is { path: string; url: string } => p !== null),
          };
        }),
      );
    },
  });
}
