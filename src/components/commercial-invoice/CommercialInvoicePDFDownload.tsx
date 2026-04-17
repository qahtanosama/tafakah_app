"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import CommercialInvoicePDF from "./CommercialInvoicePDF";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNumber: string;
  invoiceNumber: string;
  priceFactor?: number;
  filenamePrefix?: string;
}

export default function CommercialInvoicePDFDownload({
  data,
  totals,
  contractNumber,
  invoiceNumber,
  priceFactor = 1,
  filenamePrefix = "CI",
}: Props) {
  const filename = invoiceNumber
    ? `${filenamePrefix}_${invoiceNumber}.pdf`
    : `${filenamePrefix}.pdf`;

  return (
    <PDFDownloadLink
      document={
        <CommercialInvoicePDF
          data={data}
          totals={totals}
          contractNumber={contractNumber}
          invoiceNumber={invoiceNumber}
          priceFactor={priceFactor}
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
