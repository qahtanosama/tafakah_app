import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import SalesContractForm from "@/components/sales-contract/SalesContractForm";

export const metadata: Metadata = {
  title: "Sales Contract — TAFAKAH Food",
  description: "Generate export sales contracts for TAFAKAH Food (Shanghai)",
};

export default function SalesContractPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Sales Contract" />
      <SalesContractForm />
    </div>
  );
}
