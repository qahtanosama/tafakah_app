import React from "react";
import { createClient } from "@/lib/supabase/server";
import { renderReactPdfToBuffer } from "@/lib/pdf/render-server";
import { mergePdfs, type MergeInput } from "@/lib/pdf/merge";
import { buildContractDocumentData, type ContractDocSource } from "@/lib/contracts/document-data";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import FreightInvoicePDF from "@/components/freight-invoice/FreightInvoicePDF";

// react-pdf + pdf-lib run from Node, so this route must use the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "contract-documents";

// Fixed page order in the merged PDF. The client picks any subset; the order is
// always enforced server-side regardless of how the params are passed.
const DOC_ORDER = ["sc", "ci", "customs", "pl", "freight"] as const;
type DocType = (typeof DOC_ORDER)[number];
const VALID_DOC_TYPES = new Set<string>(DOC_ORDER);
const DOC_LABELS: Record<DocType, string> = {
  sc: "Sales Contract",
  ci: "Commercial Invoice",
  customs: "Customs Invoice",
  pl: "Packing List",
  freight: "Freight Invoice",
};

// Uploaded certificate order — matches the team's Stage-6 package. Generated
// docs come first, then certificates in this order. "ci-customs" is never sent
// to clients (excluded below alongside archived rows).
const CERT_ORDER = ["co", "health", "phyto", "bl", "other"];
function certRank(docType: string): number {
  const i = CERT_ORDER.indexOf(docType);
  return i === -1 ? CERT_ORDER.length : i;
}

/**
 * Client-facing "Merge Documents" endpoint for the portal. Renders the selected
 * generated documents from the SHARED builder (so they're the unified copies —
 * stamp, real incoterm, etc.) and optionally appends the client's selected
 * uploaded certificates (CO / Health / Phyto / B-L / Other), then merges them
 * with the SAME merge engine the team uses (lib/pdf/merge + render-server).
 * On-demand download only: nothing is uploaded to storage and the contract row
 * is never mutated.
 *
 * Security: identical to /api/portal/generate-pdf and /api/cert/download —
 * user-scoped createClient, RLS scopes the contract AND its documents to the
 * caller, signed URLs are created with that same user-scoped client. A client
 * passing another contract's id (or a foreign document id) is filtered out by
 * RLS. The admin client is NEVER used here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");
  const docTypesRaw = url.searchParams.get("docTypes") ?? "";
  const certIdsRaw = url.searchParams.get("certIds") ?? "";

  if (!contractId) {
    return new Response("Missing contractId", { status: 400 });
  }

  // Parse, validate, dedupe, then re-order generated docs to canonical DOC_ORDER.
  const requested = new Set(
    docTypesRaw.split(",").map((s) => s.trim()).filter(Boolean),
  );
  for (const d of requested) {
    if (!VALID_DOC_TYPES.has(d)) return new Response("Invalid docType", { status: 400 });
  }
  const selected: DocType[] = DOC_ORDER.filter((d) => requested.has(d));

  // Requested uploaded-certificate document ids (validated against the contract
  // + RLS below). Dedupe; empty entries dropped.
  const certIds = Array.from(
    new Set(certIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)),
  );

  if (selected.length === 0 && certIds.length === 0) {
    return new Response("No documents selected", { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // RLS scopes contracts to the caller (team or owning client). A client passing
  // another contract's id is filtered out by RLS -> null -> 404 below.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, bl_number, containers, master_snapshot")
    .eq("id", contractId)
    .maybeSingle();

  if (contractError || !contract) {
    return new Response("Contract not found or access denied", { status: 404 });
  }

  const contractNumber = contract.contract_no;
  const invoiceNumber = contract.invoice_no;

  // IDENTICAL data + totals to the team forms / portal single-doc route. Only
  // required when a *generated* doc is selected (cert-only merges don't need it).
  const built = buildContractDocumentData(contract as unknown as ContractDocSource);
  if (selected.length > 0 && !built) {
    return new Response("Documents not available for this contract", { status: 404 });
  }

  const inputs: MergeInput[] = [];

  try {
    // ── 1) Generated documents (in fixed DOC_ORDER) ──
    if (built && selected.length > 0) {
      const { data, totals } = built;

      // Freight is FOB-only and needs amounts from contract_shipping (RLS-scoped).
      let freightProps:
        | {
            freightBase: number;
            freightAdditional: number;
            freightChargeLabel: string;
            freightInvoiceDate: string;
            freightNotes: string;
            loadingPort: string;
            dischargePort: string;
          }
        | null = null;
      if (selected.includes("freight")) {
        const incoterm = data.shipping?.incoterm ?? "";
        if (!incoterm.trim().toUpperCase().startsWith("FOB")) {
          return new Response("Freight invoice is only available for FOB contracts", { status: 404 });
        }
        const { data: ship } = await supabase
          .from("contract_shipping")
          .select(
            "freight_base, freight_additional, freight_charge_label, freight_invoice_date, freight_notes, port_of_loading, port_of_discharge",
          )
          .eq("contract_id", contractId)
          .maybeSingle();
        const sh = (ship ?? {}) as {
          freight_base?: number | null;
          freight_additional?: number | null;
          freight_charge_label?: string | null;
          freight_invoice_date?: string | null;
          freight_notes?: string | null;
          port_of_loading?: string | null;
          port_of_discharge?: string | null;
        };
        freightProps = {
          freightBase: Number(sh.freight_base ?? 0),
          freightAdditional: Number(sh.freight_additional ?? 0),
          freightChargeLabel: sh.freight_charge_label ?? "",
          freightInvoiceDate: sh.freight_invoice_date ?? "",
          freightNotes: sh.freight_notes ?? "",
          loadingPort: sh.port_of_loading || data.shipping.loadingPort,
          dischargePort: sh.port_of_discharge || data.shipping.dischargePort,
        };
      }

      for (const docType of selected) {
        let element: React.ReactElement;
        if (docType === "sc") {
          element = React.createElement(SalesContractPDF, {
            data: data as never,
            totals: totals as never,
            contractNumber,
          });
        } else if (docType === "ci") {
          element = React.createElement(CommercialInvoicePDF, {
            data: data as never,
            totals: totals as never,
            contractNumber,
            invoiceNumber,
          });
        } else if (docType === "customs") {
          // Customs Invoice — same component at the 55% (0.55) price factor.
          element = React.createElement(CommercialInvoicePDF, {
            data: data as never,
            totals: totals as never,
            contractNumber,
            invoiceNumber,
            priceFactor: 0.55,
          });
        } else if (docType === "pl") {
          element = React.createElement(PackingListPDF, {
            data: data as never,
            totals: totals as never,
            contractNumber,
            invoiceNumber,
          });
        } else {
          // freight — freightProps is non-null here (set above when selected).
          element = React.createElement(FreightInvoicePDF, {
            data: data as never,
            invoiceNumber: `${invoiceNumber}-FRT`,
            contractNumber,
            ...freightProps!,
            containers: data.containers as never,
          });
        }
        const buffer = await renderReactPdfToBuffer(element);
        inputs.push({ source: "buffer", data: buffer, label: DOC_LABELS[docType] });
      }
    }

    // ── 2) Uploaded certificates (in CERT_ORDER, after the generated docs) ──
    if (certIds.length > 0) {
      // Scoped to THIS contract + RLS (client own) + archived hidden + never
      // ci-customs. A foreign document id simply won't be returned here.
      const { data: certRows } = await supabase
        .from("contract_documents")
        .select("id, doc_type, file_name, storage_path")
        .eq("contract_id", contractId)
        .eq("is_archived", false)
        .neq("doc_type", "ci-customs")
        .in("id", certIds);

      const rows = ((certRows ?? []) as {
        id: string;
        doc_type: string;
        file_name: string;
        storage_path: string | null;
      }[])
        .filter((r) => r.storage_path && /\.pdf$/i.test(r.file_name)) // pdf-lib can't merge images
        .sort((a, b) => certRank(a.doc_type) - certRank(b.doc_type));

      for (const r of rows) {
        const { data: signed, error: sErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(r.storage_path!, 60);
        if (sErr || !signed?.signedUrl) {
          console.warn(`[portal merge] could not sign ${r.doc_type}: ${sErr?.message ?? "unknown"}`);
          continue;
        }
        inputs.push({
          source: "url",
          data: signed.signedUrl,
          label: `${r.doc_type.toUpperCase()} (${r.file_name})`,
        });
      }
    }

    if (inputs.length === 0) {
      return new Response("No documents available to merge", { status: 404 });
    }

    const merged = await mergePdfs(inputs);
    const filename = `${contractNumber}-package.pdf`;
    return new Response(new Uint8Array(merged.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Portal merge failed:", err);
    return new Response(
      `Failed to merge documents: ${(err as Error)?.message ?? "unknown"}`,
      { status: 500 },
    );
  }
}
