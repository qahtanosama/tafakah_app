"use client";

import Link from "next/link";
import { CloudUpload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/app/(team)/providers";
import { useMigrationStatus } from "@/hooks/useMigrationStatus";

export default function MigrationBanner() {
  const { role } = useAuthContext();
  const { shouldShowBanner, dismissBanner } = useMigrationStatus({ role });

  if (!shouldShowBanner) return null;

  return (
    <div className="w-full border-b border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3 text-sm">
        <CloudUpload className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Your data is still stored on this device only. Move it to the cloud so your team can access it from anywhere.
        </span>
        <Link href="/admin/migrate">
          <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">Start Migration</Button>
        </Link>
        <button
          type="button"
          onClick={() => dismissBanner(24)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
          title="Remind me in 24 hours"
        >
          <X className="h-3.5 w-3.5" /> Remind me later
        </button>
      </div>
    </div>
  );
}
