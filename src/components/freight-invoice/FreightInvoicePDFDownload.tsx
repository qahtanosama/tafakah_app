"use client";

import { useState, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import FreightInvoicePDF from "./FreightInvoicePDF";
import type { SalesContractData } from "@/types/sales-contract";
import type { ContractContainer } from "@/types/contract";
import { supportsSaveFilePicker, saveBlobWithPicker, saveBlobWithDownload } from "@/lib/quick-share/save-file";

interface Props {
  data: SalesContractData;
  invoiceNumber: string;
  contractNumber: string;
  freightBase: number;
  freightAdditional: number;
  freightChargeLabel: string;
  freightInvoiceDate: string;
  freightNotes: string;
  loadingPort: string;
  dischargePort: string;
  containers: ContractContainer[];
}

export default function FreightInvoicePDFDownload(props: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filename = props.invoiceNumber ? `Freight_${props.invoiceNumber}.pdf` : "Freight_Invoice.pdf";

  const onClick = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await pdf(<FreightInvoicePDF {...props} />).toBlob();
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
  }, [props, filename]);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="lg" disabled={busy} onClick={onClick} className="gap-2">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
        {busy ? "Saving…" : "Generate PDF"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
