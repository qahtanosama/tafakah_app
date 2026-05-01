import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "contract-documents";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId");
  if (!documentId) return new Response("Missing documentId", { status: 400 });

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return new Response("Unauthorized", { status: 401 });

  // RLS gates this lookup: clients only see their own buyer's contracts; team
  // sees everything. Archived rows are hidden from the client policy.
  const { data: doc, error } = await supabase
    .from("contract_documents")
    .select("id, file_name, storage_path, mime_type")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !doc) return new Response("Not found or access denied", { status: 404 });
  const path = (doc as { storage_path: string | null }).storage_path;
  if (!path) return new Response("File missing", { status: 404 });

  const { data: signed, error: sErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60);

  if (sErr || !signed?.signedUrl) {
    return new Response(`Storage error: ${sErr?.message ?? "unknown"}`, { status: 500 });
  }

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) return new Response(`Fetch failed (${fileRes.status})`, { status: 500 });

  const buffer = await fileRes.arrayBuffer();
  const filename = (doc as { file_name: string }).file_name || "document";
  const mime = (doc as { mime_type: string | null }).mime_type ?? "application/octet-stream";
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
