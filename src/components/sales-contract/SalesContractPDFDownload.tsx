"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import SalesContractPDF from "./SalesContractPDF";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
}

export default function SalesContractPDFDownload({
  data,
  totals,
  contractNumber,
}: Props) {
  const filename = contractNumber
    ? `SC_${contractNumber}.pdf`
    : "SalesContract.pdf";

  return (
    <PDFDownloadLink
      document={
        <SalesContractPDF
          data={data}
          totals={totals}
          contractNumber={contractNumber}
        />
      }
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
