"use client";

import { useState } from "react";
import { LogOut, UserCircle2, Loader2, ChevronDown } from "lucide-react";
import { useAuthContext } from "@/app/(team)/providers";

/** Small floating badge in the top-right showing who's signed in + logout. */
export default function AuthBadge() {
  const { user, profile, role, loading, signOut } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return null;
  if (!user || !profile) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = "/login";
    } finally {
      setSigningOut(false);
    }
  };

  const label = profile.full_name?.trim() || user.email || "User";
  const roleColor = role === "team"
    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="fixed right-4 top-4 z-40">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border bg-white/90 py-1.5 pl-2 pr-3 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
        >
          <UserCircle2 className="h-4 w-4 text-slate-500" />
          <span className="max-w-[160px] truncate font-medium">{label}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleColor}`}>
            {role}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
        {open && (
          <div
            className="absolute right-0 mt-2 w-64 rounded-xl border bg-white p-3 text-sm shadow-xl dark:bg-zinc-900"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="mb-2 border-b pb-2">
              <p className="font-semibold truncate">{label}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            {role === "team" && (
              <a href="/admin/users" className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
                Manage users
              </a>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
