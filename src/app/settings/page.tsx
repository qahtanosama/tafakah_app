import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import SettingsForm from "@/components/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings — TAFAKAH Food",
  description: "Configure AI providers and API keys",
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] font-sans dark:bg-zinc-950">
      <AppHeader title="Settings" />
      <SettingsForm />
    </div>
  );
}
