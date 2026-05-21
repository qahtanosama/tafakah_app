import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import { getDefaultContractData } from "@/lib/sales-contract";

// react-pdf streams from Node, so this route must run on the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_DOC_TYPES = new Set(["sc", "ci", "customs", "pl"]);

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

  // RLS scopes contracts to the caller (team or owning client).
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select(
      "id, contract_no, invoice_no, contract_date, line_items, terms, totals, bl_number, containers, buyer:buyers(company_name, country)"
    )
    .eq("id", contractId)
    .maybeSingle();

  if (contractError || !contract) {
    return new Response("Contract not found or access denied", { status: 404 });
  }

  const lineItems = (contract.line_items as Array<Record<string, unknown>>) ?? [];
  const firstLineMeta = (lineItems[0] ?? {}) as { loadingPort?: string; dischargePort?: string };

  const defaults = getDefaultContractData();
  const buyerJoined = Array.isArray(contract.buyer) ? contract.buyer[0] : contract.buyer;
  const containers = ((contract.containers as Array<{ number?: unknown }> | null) ?? [])
    .map((c) => (typeof c?.number === "string" ? c.number : ""))
    .filter((n) => n.length > 0)
    .map((number) => ({ number }));
  const data = {
    identifiers: {
      ...defaults.identifiers,
      contractDate: contract.contract_date ?? "",
      invoiceDate: contract.contract_date ?? "",
      numberOfContainers: (contract.terms as { numberOfContainers?: number | "" } | null)?.numberOfContainers ?? "",
    },
    seller: defaults.seller,
    buyer: {
      ...defaults.buyer,
      company: (buyerJoined as { company_name?: string } | null)?.company_name ?? "",
    },
    bank: defaults.bank,
    shipping: {
      ...defaults.shipping,
      origin: (contract.terms as { origin?: string } | null)?.origin ?? defaults.shipping.origin,
      loadingPort: firstLineMeta.loadingPort ?? defaults.shipping.loadingPort,
      dischargePort: firstLineMeta.dischargePort ?? defaults.shipping.dischargePort,
      incoterm: (contract.terms as { incoterm?: string } | null)?.incoterm ?? defaults.shipping.incoterm,
    },
    terms: contract.terms ?? defaults.terms,
    lineItems: contract.line_items ?? defaults.lineItems,
    blNumber: (contract.bl_number as string | null) ?? null,
    containers,
  };

  const totals = contract.totals;
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
