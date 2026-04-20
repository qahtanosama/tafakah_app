import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import DocumentsManager from "@/components/documents/DocumentsManager";

export const metadata: Metadata = {
  title: "Trade Documents — TAFAKAH Food",
  description: "Upload, classify, validate and merge trade documents",
};

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Trade Documents" />
      <DocumentsManager />
    </div>
  );
}
