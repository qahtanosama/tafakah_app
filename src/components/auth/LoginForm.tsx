"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = searchParams?.get("error");
    if (e === "disabled") setError("Your account has been disabled. Contact an administrator.");
  }, [searchParams]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        if (/invalid/i.test(signInErr.message)) setError("Invalid credentials.");
        else setError(signInErr.message);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setError("Account not found.");
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("users_profile")
        .select("role, is_active")
        .eq("user_id", user.id)
        .single();

      if (profileErr || !profile) {
        await supabase.auth.signOut();
        setError("Account not found. Contact an administrator.");
        return;
      }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        setError("Your account has been disabled. Contact an administrator.");
        return;
      }

      const next = searchParams?.get("next");
      const destination = profile.role === "client" ? "/portal" : (next && next !== "/login" ? next : "/");
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setBusy(false);
    }
  }, [email, password, router, searchParams]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm dark:bg-zinc-900">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>
      <Button type="submit" className="w-full gap-2" disabled={busy || !email || !password}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Signing in..." : "Sign In"}
      </Button>
      <p className="text-center text-xs text-slate-400">
        Accounts are created by an administrator.
      </p>
    </form>
  );
}
