import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import BuyerManager from "@/components/buyers/BuyerManager";

export const metadata: Metadata = {
  title: "Buyers \u2014 TAFAKAH Food",
  description: "Manage buyer and consignee database",
};

export default function BuyersPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Buyer Database" />
      <BuyerManager />
    </div>
  );
}
