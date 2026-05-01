"use server";

import React from "react";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderReactPdfToBuffer } from "@/lib/pdf/render-server";
import { mergePdfs, type MergeInput } from "@/lib/pdf/merge";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import { getDefaultContractData } from "@/lib/sales-contract";

const STORAGE_BUCKET = "contract-documents";

// Order matters: this is the page order in the final merged PDF.
// "ci-customs" is intentionally excluded — never sent to clients.
const CERT_ORDER = ["co", "health", "phyto", "bl", "other"] as const;

export type GenerateMergedPdfResult =
  | {
      ok: true;
      path: string;
      sizeBytes: number;
      mergedCount: number;
      pageCount: number;
      skipped: { label: string; reason: string }[];
    }
  | { ok: false; error: string };

async function requireTeam(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };
  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", userData.user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) {
    return { ok: false, error: "Team access required" };
  }
  return { ok: true };
}

function isPdfFileName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\.pdf$/i.test(name.trim());
}

interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  contract_date: string | null;
  line_items: unknown;
  terms: Record<string, unknown> | null;
  totals: unknown;
  buyer: { company_name: string | null; country: string | null } | { company_name: string | null; country: string | null }[] | null;
}

interface DocRow {
  doc_type: string;
  storage_path: string | null;
  file_name: string;
}

function buildPdfData(contract: ContractRow) {
  const defaults = getDefaultContractData();
  const lineItemsRaw = (contract.line_items as Array<Record<string, unknown>>) ?? [];
  const firstLineMeta = (lineItemsRaw[0] ?? {}) as { loadingPort?: string; dischargePort?: string };
  const buyerJoined = Array.isArray(contract.buyer) ? contract.buyer[0] : contract.buyer;
  const terms = (contract.terms ?? {}) as Record<string, unknown>;

  return {
    identifiers: {
      ...defaults.identifiers,
      contractDate: contract.contract_date ?? "",
      invoiceDate: contract.contract_date ?? "",
      numberOfContainers:
        (terms.numberOfContainers as number | "" | undefined) ?? "",
    },
    seller: defaults.seller,
    buyer: {
      ...defaults.buyer,
      company: buyerJoined?.company_name ?? "",
    },
    bank: defaults.bank,
    shipping: {
      ...defaults.shipping,
      origin: (terms.origin as string | undefined) ?? defaults.shipping.origin,
      loadingPort: firstLineMeta.loadingPort ?? defaults.shipping.loadingPort,
      dischargePort: firstLineMeta.dischargePort ?? defaults.shipping.dischargePort,
      incoterm: (terms.incoterm as string | undefined) ?? defaults.shipping.incoterm,
    },
    terms: contract.terms ?? defaults.terms,
    lineItems: contract.line_items ?? defaults.lineItems,
  };
}

/**
 * Generate (or regenerate) the Final Document Package for a contract: merges
 * the auto-generated SC, CI and PL with any uploaded certificates (CO, Health,
 * Phyto, B/L, other), uploads the result to Storage and updates the contract
 * row with the new `merged_pdf_*` metadata.
 *
 * Accepts either the contract UUID (preferred) or the human contract_no.
 */
export async function generateMergedPdfForContract(
  ref: { contractId: string } | { contractNo: string },
): Promise<GenerateMergedPdfResult> {
  try {
    const guard = await requireTeam();
    if (!guard.ok) return { ok: false, error: guard.error };

    const admin = createAdminClient();

    const lookupCol = "contractId" in ref ? "id" : "contract_no";
    const lookupVal = "contractId" in ref ? ref.contractId : ref.contractNo;

    const { data: contractRaw, error: cErr } = await admin
      .from("contracts")
      .select(
        "id, contract_no, invoice_no, contract_date, line_items, terms, totals, buyer:buyers(company_name, country)",
      )
      .eq(lookupCol, lookupVal)
      .maybeSingle();

    if (cErr || !contractRaw) {
      return { ok: false, error: `Contract not found: ${cErr?.message ?? "unknown"}` };
    }
    const contract = contractRaw as unknown as ContractRow;

    const { data: docsRaw } = await admin
      .from("contract_documents")
      .select("doc_type, storage_path, file_name")
      .eq("contract_id", contract.id);
    const docs = (docsRaw ?? []) as DocRow[];

    const data = buildPdfData(contract);
    const totals = (contract.totals ?? {}) as never;

    // Render the three auto-generated documents in parallel.
    const [scBuffer, ciBuffer, plBuffer] = await Promise.all([
      renderReactPdfToBuffer(
        React.createElement(SalesContractPDF, {
          data: data as never,
          totals,
          contractNumber: contract.contract_no,
        }),
      ),
      renderReactPdfToBuffer(
        React.createElement(CommercialInvoicePDF, {
          data: data as never,
          totals,
          contractNumber: contract.contract_no,
          invoiceNumber: contract.invoice_no,
        }),
      ),
      renderReactPdfToBuffer(
        React.createElement(PackingListPDF, {
          data: data as never,
          totals,
          contractNumber: contract.contract_no,
          invoiceNumber: contract.invoice_no,
        }),
      ),
    ]);

    const inputs: MergeInput[] = [
      { source: "buffer", data: scBuffer, label: "Sales Contract" },
      { source: "buffer", data: ciBuffer, label: "Commercial Invoice" },
      { source: "buffer", data: plBuffer, label: "Packing List" },
    ];

    // Add uploaded certificates in CERT_ORDER. Skip non-PDF uploads (images
    // would need conversion — out of scope for this iteration).
    for (const certType of CERT_ORDER) {
      const cert = docs.find(
        (d) => d.doc_type === certType && isPdfFileName(d.file_name) && d.storage_path,
      );
      if (!cert?.storage_path) continue;
      const { data: signed, error: sErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(cert.storage_path, 60);
      if (sErr || !signed?.signedUrl) {
        console.warn(`[generateMergedPdf] Could not sign ${certType}: ${sErr?.message ?? "unknown"}`);
        continue;
      }
      inputs.push({
        source: "url",
        data: signed.signedUrl,
        label: `${certType.toUpperCase()} (${cert.file_name})`,
      });
    }

    const merged = await mergePdfs(inputs);

    const timestamp = Date.now();
    const path = `contracts/${contract.id}/merged/final-${timestamp}.pdf`;
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, merged.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

    const { error: updErr } = await admin
      .from("contracts")
      .update({
        merged_pdf_path: path,
        merged_pdf_generated_at: new Date().toISOString(),
        merged_pdf_size_bytes: merged.buffer.length,
        merged_pdf_doc_count: merged.mergedCount,
      })
      .eq("id", contract.id);
    if (updErr) return { ok: false, error: `Update failed: ${updErr.message}` };

    return {
      ok: true,
      path,
      sizeBytes: merged.buffer.length,
      mergedCount: merged.mergedCount,
      pageCount: merged.pageCount,
      skipped: merged.skipped,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
