import type { NextApiRequest, NextApiResponse } from "next";
import React from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { renderToStream } from "@react-pdf/renderer";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import { getDefaultContractData } from "@/lib/sales-contract";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const contractId = req.query.contractId as string;
  const docType = req.query.docType as string;

  if (!contractId || !docType) {
    return res.status(400).send("Missing contractId or docType");
  }

  if (!["sc", "ci", "customs", "pl"].includes(docType)) {
    return res.status(400).send("Invalid docType");
  }

  // NOTE: In Pages Router we must parse cookies manually if we want auth.
  // For now, we will require the auth token to be passed via cookies.
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        cookie: req.headers.cookie ?? "",
      },
    },
  });
  
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return res.status(401).send("Unauthorized");
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, contract_date, line_items, terms, totals, buyer:buyers(company_name, country)")
    .eq("id", contractId)
    .single();

  if (error || !contract) {
    return res.status(404).send("Contract not found");
  }
  
  const lineItems = (contract.line_items as Array<Record<string, unknown>>) ?? [];
  const firstLineMeta = (lineItems[0] ?? {}) as { loadingPort?: string; dischargePort?: string };

  const defaults = getDefaultContractData();
  const data = {
    identifiers: {
      ...defaults.identifiers,
      contractDate: contract.contract_date ?? "",
      invoiceDate: contract.contract_date ?? "",
      numberOfContainers: (contract.terms as any)?.numberOfContainers ?? "",
    },
    seller: defaults.seller,
    buyer: {
      ...defaults.buyer,
      company: Array.isArray(contract.buyer) ? contract.buyer[0]?.company_name : (contract.buyer as any)?.company_name ?? "",
    },
    bank: defaults.bank,
    shipping: {
      ...defaults.shipping,
      origin: (contract.terms as any)?.origin ?? defaults.shipping.origin,
      loadingPort: firstLineMeta.loadingPort ?? defaults.shipping.loadingPort,
      dischargePort: firstLineMeta.dischargePort ?? defaults.shipping.dischargePort,
      incoterm: (contract.terms as any)?.incoterm ?? defaults.shipping.incoterm,
    },
    terms: contract.terms ?? defaults.terms,
    lineItems: contract.line_items ?? defaults.lineItems,
  };

  const totals = contract.totals;
  const contractNumber = contract.contract_no;
  const invoiceNumber = contract.invoice_no;

  let docElement;
  let filename = "";

  if (docType === "sc") {
    docElement = <SalesContractPDF data={data as any} totals={totals as any} contractNumber={contractNumber} />;
    filename = `Sales_Contract_${contractNumber}.pdf`;
  } else if (docType === "ci") {
    docElement = <CommercialInvoicePDF data={data as any} totals={totals as any} contractNumber={contractNumber} invoiceNumber={invoiceNumber} />;
    filename = `Commercial_Invoice_${invoiceNumber}.pdf`;
  } else if (docType === "customs") {
    docElement = <CommercialInvoicePDF data={data as any} totals={totals as any} contractNumber={contractNumber} invoiceNumber={invoiceNumber} priceFactor={0.55} />;
    filename = `Customs_Invoice_${invoiceNumber}.pdf`;
  } else if (docType === "pl") {
    docElement = <PackingListPDF data={data as any} totals={totals as any} contractNumber={contractNumber} invoiceNumber={invoiceNumber} />;
    filename = `Packing_List_${invoiceNumber}.pdf`;
  }

  if (!docElement) return res.status(400).send("Invalid document type");

  try {
    const stream = await renderToStream(docElement as any);
    
    // Convert Node.js Readable stream to Buffer for Next.js
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("PDF generation failed:", err);
    return res.status(500).send(`Failed to generate PDF: ${err?.message}\n${err?.stack}`);
  }
}
