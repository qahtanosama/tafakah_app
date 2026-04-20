import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import ContractLogTable from "@/components/contract-log/ContractLogTable";

export const metadata: Metadata = {
  title: "Contract Log — TAFAKAH Food",
  description: "All submitted contracts",
};

export default function ContractLogPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Contract Log" />

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <ContractLogTable />
      </div>
    </div>
  );
}
