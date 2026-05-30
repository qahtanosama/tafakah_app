"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, AlertTriangle, CheckCircle, Copy, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getBuyerPortalStatus,
  disableClientUserForBuyer,
  resetClientPasswordForBuyer,
  createClientUserForBuyer,
  type BuyerPortalStatus,
} from "@/app/(team)/admin/users/actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

interface Props {
  localBuyerId: string;
  buyerEmail: string | null | undefined;
  buyerCompanyName: string;
}

type Credentials = { email: string; password: string };

export default function BuyerPortalAccess({ localBuyerId, buyerEmail, buyerCompanyName }: Props) {
  const [status, setStatus] = useState<BuyerPortalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [pendingPassword, setPendingPassword] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);

  const existsQuery = useQuery({
    queryKey: ["buyer-exists", localBuyerId],
    queryFn: async () => {
      if (!isUuid(localBuyerId)) return false;
      const supabase = createClient();
      const { data, error: dbErr } = await supabase
        .from("buyers")
        .select("id")
        .eq("id", localBuyerId)
        .maybeSingle();
      if (dbErr) return false;
      return !!data;
    },
  });

  const existsInDb = existsQuery.isSuccess && existsQuery.data === true;
  const buyerUuid = existsInDb ? localBuyerId : null;

  const load = useCallback(async () => {
    if (!buyerUuid) { setLoaded(true); return; }
    const resp = await getBuyerPortalStatus(buyerUuid);
    if (!resp.ok) setError(resp.error ?? "Failed to load portal status");
    else setStatus(resp.status ?? null);
    setLoaded(true);
  }, [buyerUuid]);

  useEffect(() => { load(); }, [load]);

  const copyCreds = useCallback(async () => {
    if (!credentials) return;
    const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch { /* ignore */ }
  }, [credentials]);

  const handleCreate = useCallback(() => {
    if (!buyerUuid) return;
    startTransition(async () => {
      const resp = await createClientUserForBuyer(buyerUuid, pendingPassword || undefined);
      if (!resp.ok) { setError(resp.error ?? "Failed to create client login"); return; }
      if (resp.data?.email && resp.data.password) setCredentials({ email: resp.data.email, password: resp.data.password });
      setShowCreate(false);
      setPendingPassword("");
      await load();
    });
  }, [buyerUuid, pendingPassword, load]);

  const handleDisable = useCallback(() => {
    if (!buyerUuid) return;
    if (!confirm(`Disable portal access for ${buyerCompanyName}? The client user will be signed out and blocked from logging in.`)) return;
    startTransition(async () => {
      const resp = await disableClientUserForBuyer(buyerUuid);
      if (!resp.ok) { setError(resp.error ?? "Failed to disable"); return; }
      await load();
    });
  }, [buyerUuid, buyerCompanyName, load]);

  const handleReset = useCallback(() => {
    if (!buyerUuid) return;
    if (!confirm(`Reset password for ${buyerCompanyName}? The new password will be shown once.`)) return;
    startTransition(async () => {
      const resp = await resetClientPasswordForBuyer(buyerUuid);
      if (!resp.ok) { setError(resp.error ?? "Failed to reset password"); return; }
      if (resp.data?.email && resp.data.password) setCredentials({ email: resp.data.email, password: resp.data.password });
      await load();
    });
  }, [buyerUuid, buyerCompanyName, load]);

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold">Portal Access</h3>
      </div>

      {(existsQuery.isPending || (existsInDb && !loaded)) && (
        <p className="flex items-center gap-1 text-xs text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking portal status&hellip;
        </p>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {existsQuery.isSuccess && !existsInDb && (
        <p className="text-xs text-amber-600">
          This buyer isn&rsquo;t in the cloud database. Re-save it from the Buyers page, then reload.
        </p>
      )}

      {loaded && buyerUuid && status?.buyerExists && !status.portalEnabled && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            No client login yet. Creating one will let {buyerCompanyName} sign in at <code>/login</code> and see only their own contracts.
          </p>
          {!buyerEmail && (
            <p className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Add an email to the buyer first (saved separately).
            </p>
          )}
          {!showCreate ? (
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!buyerEmail || isPending}>
              Create Client Login
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-zinc-50 p-3 dark:bg-zinc-800">
              <div>
                <Label htmlFor="buyer-portal-pw" className="text-xs">Password (leave blank to auto-generate; min 12 chars)</Label>
                <Input
                  id="buyer-portal-pw"
                  value={pendingPassword}
                  onChange={(e) => setPendingPassword(e.target.value)}
                  placeholder="Auto-generated if empty"
                  minLength={12}
                  disabled={isPending}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={isPending} className="gap-1">
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                  {isPending ? "Creating\u2026" : "Confirm"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setPendingPassword(""); }} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {loaded && status?.portalEnabled && status.clientUserId && (
        <div className="space-y-2 text-xs">
          <p className={`flex items-center gap-1 ${status.clientActive ? "text-emerald-600" : "text-amber-600"}`}>
            <CheckCircle className="h-3 w-3" />
            Portal access {status.clientActive ? "enabled" : "disabled"} for {status.email}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleDisable} disabled={isPending}>
              {status.clientActive ? "Disable" : "Disabled"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending}>
              Reset password
            </Button>
          </div>
        </div>
      )}

      {credentials && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Send these to {buyerCompanyName} via WhatsApp:</p>
              <p className="mt-1 font-mono">Email: {credentials.email}</p>
              <p className="font-mono">Password: {credentials.password}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={copyCreds} className="gap-1">
                <Copy className="h-3 w-3" /> {copyFlash ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCredentials(null)}><X className="h-3 w-3" /></Button>
            </div>
          </div>
          <p className="mt-2">This is the only time the password is shown.</p>
        </div>
      )}
    </div>
  );
}
