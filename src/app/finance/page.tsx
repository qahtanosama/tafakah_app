import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import FinanceOverview from "@/components/finance/FinanceOverview";

export const metadata: Metadata = {
  title: "Finance & Payments \u2014 TAFAKAH Food",
  description: "Track costs, payments, and profit per shipment",
};

export default function FinancePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Finance & Payments" />
      <FinanceOverview />
    </div>
  );
}
