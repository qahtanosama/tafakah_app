"use client";

import { LogOut, Loader2 } from "lucide-react";
import { useState } from "react";

export default function SignOutIcon() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = () => {
    setLoading(true);
    // The /logout route records the audit event, signs out server-side, and
    // redirects to /login; the full document navigation clears client state.
    window.location.assign("/logout");
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-800 dark:hover:text-red-400"
      title="Sign Out"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span className="hidden sm:inline">Sign Out</span>
    </button>
  );
}
