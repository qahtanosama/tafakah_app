import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import MasterDataForm from "@/components/master/MasterDataForm";

export const metadata: Metadata = {
  title: "Master Data \u2014 TAFAKAH Food",
  description: "Single source of truth for all shipment documents",
};

export default function MasterPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Master Data Sheet" />
      <MasterDataForm />
    </div>
  );
}
