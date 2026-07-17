"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ARRIVAL_CONDITIONS,
  ARRIVAL_ISSUE_TAGS,
  ARRIVAL_MAX_PHOTOS,
  ARRIVAL_MAX_PHOTO_BYTES,
  ARRIVAL_PHOTO_EXTENSIONS,
} from "@/types/arrival-report";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "contract-documents";
const ALLOWED_EXT = new Set<string>(ARRIVAL_PHOTO_EXTENSIONS);

export type SubmitArrivalResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function removeUploaded(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/**
 * Create or edit an arrival report for a contract the signed-in user may write.
 *
 * Security is enforced at the DATABASE layer, not here:
 *   - The authenticated (anon-key, cookie-session) Supabase client is used, so
 *     every storage upload and every table insert/update passes through RLS.
 *   - A client can only ever upload into contracts/{ownContractId}/arrival/ and
 *     can only insert/update a report row whose contract their buyer owns and
 *     whose created_by = auth.uid(). The app-layer checks below are a friendly
 *     first line that returns clean errors; RLS is the actual gate.
 *
 * `reportId` present → edit (new photos are appended). Absent → create.
 */
export async function submitArrivalReport(
  formData: FormData,
  locale: string,
): Promise<SubmitArrivalResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "notSignedIn" };

  const contractId = String(formData.get("contractId") ?? "").trim();
  if (!contractId) return { ok: false, error: "missingContract" };

  // Ownership + valid containers. RLS scopes a client to their own contract, so
  // a missing row here means the contract isn't theirs (or doesn't exist).
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, containers")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { ok: false, error: "accessDenied" };

  const validContainers = (
    (contract.containers as Array<{ number?: unknown }> | null) ?? []
  )
    .map((c) => (typeof c?.number === "string" ? c.number : ""))
    .filter((n) => n.length > 0);

  // --- scalar fields -------------------------------------------------------
  const containerNumber = (String(formData.get("containerNumber") ?? "").trim()) || null;
  if (containerNumber && !validContainers.includes(containerNumber)) {
    return { ok: false, error: "invalidContainer" };
  }

  const condition = (String(formData.get("condition") ?? "").trim()) || null;
  if (condition && !ARRIVAL_CONDITIONS.includes(condition as never)) {
    return { ok: false, error: "invalidCondition" };
  }

  const issueTags = formData
    .getAll("issueTags")
    .map(String)
    .filter((t) => ARRIVAL_ISSUE_TAGS.includes(t as never));

  const arrivalDate = (String(formData.get("arrivalDate") ?? "").trim()) || null;

  const damagedBoxes = parseCount(formData.get("damagedBoxes"));
  if (damagedBoxes === "invalid") return { ok: false, error: "invalidNumber" };
  const totalBoxes = parseCount(formData.get("totalBoxes"));
  if (totalBoxes === "invalid") return { ok: false, error: "invalidNumber" };

  const comments = (String(formData.get("comments") ?? "").trim()) || null;

  // --- photos --------------------------------------------------------------
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > ARRIVAL_MAX_PHOTOS) {
    return { ok: false, error: "tooManyPhotos" };
  }

  const uploaded: string[] = [];
  for (const file of files) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      await removeUploaded(supabase, uploaded);
      return { ok: false, error: "badPhotoType" };
    }
    if (file.size > ARRIVAL_MAX_PHOTO_BYTES) {
      await removeUploaded(supabase, uploaded);
      return { ok: false, error: "photoTooLarge" };
    }
    // Random name, no user-controlled path segment → can't escape the folder.
    const path = `contracts/${contractId}/arrival/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) {
      await removeUploaded(supabase, uploaded);
      // A storage RLS denial lands here too (client uploading outside own folder).
      return { ok: false, error: "uploadFailed" };
    }
    uploaded.push(path);
  }

  const reportId = (String(formData.get("reportId") ?? "").trim()) || null;

  const payload = {
    container_number: containerNumber,
    arrival_date: arrivalDate,
    damaged_boxes: damagedBoxes,
    total_boxes: totalBoxes,
    condition,
    issue_tags: issueTags,
    comments,
  };

  if (reportId) {
    // Edit: append newly-uploaded photos to whatever the row already has. The
    // select is RLS-scoped, so a foreign reportId returns nothing → rejected.
    const { data: existing } = await supabase
      .from("contract_arrival_reports")
      .select("photo_paths")
      .eq("id", reportId)
      .maybeSingle();
    if (!existing) {
      await removeUploaded(supabase, uploaded);
      return { ok: false, error: "accessDenied" };
    }
    const merged = [
      ...(Array.isArray(existing.photo_paths) ? (existing.photo_paths as string[]) : []),
      ...uploaded,
    ];
    const { error } = await supabase
      .from("contract_arrival_reports")
      .update({ ...payload, photo_paths: merged })
      .eq("id", reportId);
    if (error) {
      await removeUploaded(supabase, uploaded);
      return { ok: false, error: "saveFailed" };
    }
    revalidatePath(`/${locale}/portal/contract/${contractId}`);
    return { ok: true, id: reportId };
  }

  const { data, error } = await supabase
    .from("contract_arrival_reports")
    .insert({
      ...payload,
      contract_id: contractId,
      photo_paths: uploaded,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    await removeUploaded(supabase, uploaded);
    // RLS insert denial (foreign contract) also surfaces here.
    return { ok: false, error: "saveFailed" };
  }

  revalidatePath(`/${locale}/portal/contract/${contractId}`);
  return { ok: true, id: data.id as string };
}

export type DeleteArrivalResult = { ok: true } | { ok: false; error: string };

/**
 * Delete a client's OWN arrival report and clean up its photos.
 *
 * RLS is the gate: the authenticated client is used, so the row delete only
 * succeeds when the DELETE policy passes (created_by = auth.uid() AND own
 * contract). We delete the ROW FIRST and read back the deleted row — if RLS
 * blocked it (someone else's report, even on a shared buyer), nothing comes
 * back and we stop WITHOUT touching storage. Only then do we remove the photos
 * (also RLS-scoped to the client's own arrival/ folder).
 */
export async function deleteArrivalReport(
  reportId: string,
  locale: string,
): Promise<DeleteArrivalResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "notSignedIn" };

  const id = reportId.trim();
  if (!id) return { ok: false, error: "deleteFailed" };

  const { data: deleted, error } = await supabase
    .from("contract_arrival_reports")
    .delete()
    .eq("id", id)
    .select("id, contract_id, photo_paths");
  if (error) return { ok: false, error: "deleteFailed" };
  if (!deleted || deleted.length === 0) {
    // RLS blocked it (not the caller's report) or it no longer exists.
    return { ok: false, error: "accessDenied" };
  }

  const row = deleted[0];
  const paths = Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [];
  if (paths.length) {
    // Best-effort cleanup; the row is already gone. RLS confines removal to the
    // client's own arrival/ folder.
    await supabase.storage.from(BUCKET).remove(paths);
  }

  revalidatePath(`/${locale}/portal/contract/${row.contract_id}`);
  return { ok: true };
}

/** "" / null → null; a non-negative integer → number; anything else → "invalid". */
function parseCount(raw: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}
