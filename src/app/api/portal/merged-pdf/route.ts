import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "contract-documents";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");
  const contractNo = url.searchParams.get("contractNo");

  if (!contractId && !contractNo) {
    return new Response("Missing contractId or contractNo", { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // RLS scopes contracts to the caller (team or owning client).
  const query = supabase
    .from("contracts")
    .select("id, contract_no, merged_pdf_path");
  const filtered = contractId
    ? query.eq("id", contractId)
    : query.eq("contract_no", contractNo!);

  const { data: contract, error } = await filtered.maybeSingle();

  if (error || !contract) {
    return new Response("Not found", { status: 404 });
  }
  const path = (contract as { merged_pdf_path: string | null }).merged_pdf_path;
  if (!path) {
    return new Response("No merged package available", { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60);

  if (sErr || !signed?.signedUrl) {
    return new Response(`Storage error: ${sErr?.message ?? "unknown"}`, { status: 500 });
  }

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) {
    return new Response(`Fetch failed (${fileRes.status})`, { status: 500 });
  }

  const buffer = await fileRes.arrayBuffer();
  const filename = `${(contract as { contract_no: string }).contract_no}-final-package.pdf`;
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
