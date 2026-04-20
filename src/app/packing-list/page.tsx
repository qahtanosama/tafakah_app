import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import PackingListForm from "@/components/packing-list/PackingListForm";

export const metadata: Metadata = {
  title: "Packing List — TAFAKAH Food",
  description: "Generate packing lists for shipments",
};

export default function PackingListPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Packing List" />
      <PackingListForm />
    </div>
  );
}
