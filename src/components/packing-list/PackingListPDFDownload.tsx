"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import PackingListPDF from "./PackingListPDF";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
  invoiceNumber: string;
}

export default function PackingListPDFDownload({ data, totals, contractNumber, invoiceNumber }: Props) {
  const filename = invoiceNumber ? `PL_${invoiceNumber}.pdf` : "PackingList.pdf";

  return (
    <PDFDownloadLink
      document={<PackingListPDF data={data} totals={totals} contractNumber={contractNumber} invoiceNumber={invoiceNumber} />}
      fileName={filename}
    >
      {({ loading }) => (
        <Button size="lg" disabled={loading} className="gap-2">
          <FileDown className="h-5 w-5" />
          {loading ? "Preparing PDF..." : "Generate PDF"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
