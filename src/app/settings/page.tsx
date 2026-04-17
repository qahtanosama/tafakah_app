import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SettingsForm from "@/components/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings \u2014 TAFAKAH Food",
  description: "Configure AI providers and API keys",
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="sticky top-0 z-10 w-full border-b bg-white dark:bg-zinc-900">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />Home
          </Link>
          <h1 className="text-lg font-bold tracking-tight">Settings</h1>
        </div>
      </header>
      <SettingsForm />
    </div>
  );
}
