"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";

export default function SignOutIcon() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    setSigningOut(true);
    // The /logout route records the audit event, signs out server-side, and
    // redirects to /login; the full document navigation clears client state.
    window.location.assign("/logout");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="relative p-2 rounded-full text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-300"
      title="Sign out"
    >
      {signingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
    </button>
  );
}
