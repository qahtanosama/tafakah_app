import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import InvoiceForm from "@/components/commercial-invoice/InvoiceForm";

export const metadata: Metadata = {
  title: "Commercial Invoice — TAFAKAH Food",
  description: "Generate commercial invoices for shipments",
};

export default function CommercialInvoicePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Commercial Invoice" />
      <InvoiceForm variant="commercial" />
    </div>
  );
}
