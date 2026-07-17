"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordLoginEvent } from "@/app/(team)/login/log-login";

export default function LoginForm() {
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
    let navigating = false;
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
        .select("role, is_active, preferred_language")
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

      // Audit log — best-effort, never block the redirect.
      void recordLoginEvent(user.id);

      // Only same-site paths — a crafted ?next=https://evil.com (or //evil.com)
      // must never become the post-login destination.
      const next = searchParams?.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") && next !== "/login" ? next : null;
      let destination: string;
      if (profile.role === "client") {
        destination = profile.preferred_language === "ar" ? "/ar/portal" : "/portal";
      } else {
        // Both team and super_admin land on /. super_admin can navigate to
        // /admin/super from there.
        destination = safeNext ?? "/";
      }
      // Full-page navigation, deliberately NOT router.replace(): the client
      // router still caches the logged-out payload for "/" (the middleware
      // rewrite to /welcome), so a soft navigation lands back on the welcome
      // screen until a manual reload. A document load re-runs the middleware
      // with the fresh session cookies and clears the router cache.
      navigating = true;
      window.location.assign(destination);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      // Keep `busy` true through a successful sign-in — the page is about to
      // unload, and re-enabling the form would flash an interactive state.
      if (!navigating) setBusy(false);
    }
  }, [email, password, searchParams]);

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
