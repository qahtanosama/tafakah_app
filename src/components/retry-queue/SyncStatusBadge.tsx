"use client";

import Link from "next/link";
import { CloudOff, Cloud, Loader2, AlertTriangle } from "lucide-react";
import { useRetryQueue } from "./RetryQueueProvider";

export default function SyncStatusBadge() {
  const { pendingCount, syncing, isOnline } = useRetryQueue();

  if (!isOnline) {
    return (
      <Link
        href="/settings#sync-issues"
        className="fixed right-4 top-14 z-40 flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50/90 px-3 py-1 text-xs font-medium text-red-700 shadow-sm backdrop-blur-md hover:bg-red-100"
        title="You are offline. Changes will sync when reconnected."
      >
        <CloudOff className="h-3.5 w-3.5" /> Offline
      </Link>
    );
  }

  if (pendingCount > 0) {
    return (
      <Link
        href="/settings#sync-issues"
        className="fixed right-4 top-14 z-40 flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm backdrop-blur-md hover:bg-amber-100"
        title="Click to open Sync Issues"
      >
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {pendingCount} pending
      </Link>
    );
  }

  if (syncing) {
    return (
      <div className="fixed right-4 top-14 z-40 flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/90 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur-md">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing&hellip;
      </div>
    );
  }

  return (
    <div
      className="fixed right-4 top-14 z-40 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm backdrop-blur-md"
      title="All changes synced"
    >
      <Cloud className="h-3.5 w-3.5" /> Synced
    </div>
  );
}
