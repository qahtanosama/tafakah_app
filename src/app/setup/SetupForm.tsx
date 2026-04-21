"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { createFirstAdmin } from "./actions";

export default function SetupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const formData = new FormData(e.currentTarget);
    const result = await createFirstAdmin(formData);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Setup failed.");
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/login"), 1500);
  }, [router]);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        <CheckCircle className="h-8 w-8" />
        <p className="font-medium">Admin account created.</p>
        <p>Redirecting to sign-in&hellip;</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm dark:bg-zinc-900">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <Label htmlFor="fullName">Full Name</Label>
        <Input id="fullName" name="fullName" required disabled={busy} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={busy} />
      </div>
      <div>
        <Label htmlFor="password">Password (min 12 chars)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required disabled={busy} />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required disabled={busy} />
      </div>
      <Button type="submit" className="w-full gap-2" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Creating..." : "Create Admin Account"}
      </Button>
      <p className="text-center text-xs text-slate-400">
        This page is only available until the first admin exists.
      </p>
    </form>
  );
}
