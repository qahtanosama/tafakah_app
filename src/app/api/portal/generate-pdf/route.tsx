import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import FreightInvoicePDF from "@/components/freight-invoice/FreightInvoicePDF";
import { buildContractDocumentData, type ContractDocSource } from "@/lib/contracts/document-data";

// react-pdf streams from Node, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_DOC_TYPES = new Set(["sc", "ci", "customs", "pl", "freight"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");
  const docType = url.searchParams.get("docType");

  if (!contractId || !docType) {
    return new Response("Missing contractId or docType", { status: 400 });
  }
  if (!VALID_DOC_TYPES.has(docType)) {
    return new Response("Invalid docType", { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // RLS scopes contracts to the caller (team or owning client). A client passing
  // another contract's id is filtered out by RLS → null → 404 below. The frozen
  // master_snapshot + live B/L/containers are all the shared builder needs.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, bl_number, containers, master_snapshot")
    .eq("id", contractId)
    .maybeSingle();

  if (contractError || !contract) {
    return new Response("Contract not found or access denied", { status: 404 });
  }

  // IDENTICAL data + totals to the team forms (see lib/contracts/document-data).
  // No master_snapshot → 404 (parity with the team's empty state).
  const built = buildContractDocumentData(contract as unknown as ContractDocSource);
  if (!built) {
    return new Response("Document not available for this contract", { status: 404 });
  }
  const { data, totals } = built;
  const contractNumber = contract.contract_no;
  const invoiceNumber = contract.invoice_no;

  let docElement: React.ReactElement | null = null;
  let filename = "";

  if (docType === "sc") {
    docElement = React.createElement(SalesContractPDF, {
      data: data as never,
      totals: totals as never,
      contractNumber,
    });
    filename = `Sales_Contract_${contractNumber}.pdf`;
  } else if (docType === "ci") {
    docElement = React.createElement(CommercialInvoicePDF, {
      data: data as never,
      totals: totals as never,
      contractNumber,
      invoiceNumber,
    });
    filename = `Commercial_Invoice_${invoiceNumber}.pdf`;
  } else if (docType === "customs") {
    docElement = React.createElement(CommercialInvoicePDF, {
      data: data as never,
      totals: totals as never,
      contractNumber,
      invoiceNumber,
      priceFactor: 0.55,
    });
    filename = `Customs_Invoice_${invoiceNumber}.pdf`;
  } else if (docType === "pl") {
    docElement = React.createElement(PackingListPDF, {
      data: data as never,
      totals: totals as never,
      contractNumber,
      invoiceNumber,
    });
    filename = `Packing_List_${invoiceNumber}.pdf`;
  } else if (docType === "freight") {
    // Freight Invoice — FOB only. Incoterm comes from the shared builder's
    // data.shipping (sourced from master_snapshot) — same gate as the team form.
    const incoterm = data.shipping?.incoterm ?? "";
    if (!incoterm.trim().toUpperCase().startsWith("FOB")) {
      return new Response("Freight invoice is only available for FOB contracts", { status: 404 });
    }
    const { data: ship } = await supabase
      .from("contract_shipping")
      .select("freight_base, freight_additional, freight_charge_label, freight_invoice_date, freight_notes, port_of_loading, port_of_discharge")
      .eq("contract_id", contractId)
      .maybeSingle();
    const sh = (ship ?? {}) as {
      freight_base?: number | null; freight_additional?: number | null;
      freight_charge_label?: string | null; freight_invoice_date?: string | null;
      freight_notes?: string | null; port_of_loading?: string | null; port_of_discharge?: string | null;
    };
    docElement = React.createElement(FreightInvoicePDF, {
      data: data as never,
      invoiceNumber: `${invoiceNumber}-FRT`,
      contractNumber,
      freightBase: Number(sh.freight_base ?? 0),
      freightAdditional: Number(sh.freight_additional ?? 0),
      freightChargeLabel: sh.freight_charge_label ?? "",
      freightInvoiceDate: sh.freight_invoice_date ?? "",
      freightNotes: sh.freight_notes ?? "",
      loadingPort: sh.port_of_loading || data.shipping.loadingPort,
      dischargePort: sh.port_of_discharge || data.shipping.dischargePort,
      containers: data.containers as never,
    });
    filename = `Freight_${invoiceNumber}-FRT.pdf`;
  }

  if (!docElement) return new Response("Invalid document type", { status: 400 });

  try {
    const stream = await renderToStream(docElement as Parameters<typeof renderToStream>[0]);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("PDF generation failed:", err);
    return new Response(`Failed to generate PDF: ${(err as Error)?.message ?? "unknown"}`, { status: 500 });
  }
}
