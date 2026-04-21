"use client";

import { useState, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import PackingListPDF from "./PackingListPDF";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import { supportsSaveFilePicker, saveBlobWithPicker, saveBlobWithDownload } from "@/lib/quick-share/save-file";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
  invoiceNumber: string;
}

export default function PackingListPDFDownload({ data, totals, contractNumber, invoiceNumber }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filename = invoiceNumber ? `PL_${invoiceNumber}.pdf` : "PackingList.pdf";

  const onClick = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await pdf(
        <PackingListPDF data={data} totals={totals} contractNumber={contractNumber} invoiceNumber={invoiceNumber} />
      ).toBlob();
      if (supportsSaveFilePicker()) {
        await saveBlobWithPicker(blob, filename);
      } else {
        await saveBlobWithDownload(blob, filename);
      }
    } catch (e) {
      setErr((e as Error).message || "Failed to save PDF");
    } finally {
      setBusy(false);
    }
  }, [data, totals, contractNumber, invoiceNumber, filename]);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="lg" disabled={busy} onClick={onClick} className="gap-2">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
        {busy ? "Saving\u2026" : "Generate PDF"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
