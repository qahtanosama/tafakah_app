"use client";

import { useState, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import SalesContractPDF from "@/components/sales-contract/SalesContractPDF";
import CommercialInvoicePDF from "@/components/commercial-invoice/CommercialInvoicePDF";
import PackingListPDF from "@/components/packing-list/PackingListPDF";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNo: string;
  invoiceNo: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DownloadAllButton({ data, totals, contractNo, invoiceNo }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const docs = [
        { el: <SalesContractPDF data={data} totals={totals} contractNumber={contractNo} />, name: `SC_${contractNo}.pdf` },
        { el: <CommercialInvoicePDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />, name: `CI_${invoiceNo}.pdf` },
        { el: <CommercialInvoicePDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} priceFactor={0.55} />, name: `CI-Customs_${invoiceNo}.pdf` },
        { el: <PackingListPDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />, name: `PL_${invoiceNo}.pdf` },
      ];

      for (const doc of docs) {
        const blob = await pdf(doc.el).toBlob();
        triggerDownload(blob, doc.name);
        // Small delay between downloads so the browser doesn't block them
        await new Promise((r) => setTimeout(r, 300));
      }
    } finally {
      setLoading(false);
    }
  }, [data, totals, contractNo, invoiceNo]);

  return (
    <Button
      size="lg"
      variant="outline"
      className="gap-2"
      disabled={loading}
      onClick={handleDownloadAll}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      {loading ? "Generating 4 PDFs..." : "Download All Documents"}
    </Button>
  );
}
