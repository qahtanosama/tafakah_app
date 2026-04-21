import type { Metadata } from "next";
import { Suspense } from "react";
import AppHeader from "@/components/ui/app-header";
import SellerManager from "@/components/sellers/SellerManager";

export const metadata: Metadata = {
  title: "Sellers \u2014 TAFAKAH Food",
  description: "Manage factory / supplier database",
};

export default function SellersPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Sellers / Factories" />
      <Suspense fallback={<div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>}>
        <SellerManager />
      </Suspense>
    </div>
  );
}
