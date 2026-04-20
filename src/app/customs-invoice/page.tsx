import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import InvoiceForm from "@/components/commercial-invoice/InvoiceForm";

export const metadata: Metadata = {
  title: "Customs Invoice — TAFAKAH Food",
  description: "Generate customs declaration invoices",
};

export default function CustomsInvoicePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Customs Invoice" />
      <InvoiceForm variant="customs" />
    </div>
  );
}
