"use client";

import { useState, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, UserPlus, Copy, Check, Loader2, X } from "lucide-react";
import { createTeamUser, toggleUserActive, type UserRow } from "./actions";

interface Credentials {
  email: string;
  password: string;
}

export default function UsersAdminClient({ users }: { users: UserRow[] }) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copyFlash, setCopyFlash] = useState(false);

  const handleCreateTeam = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const result = await createTeamUser(formData);
      if (!result.ok) {
        setError(result.error ?? "Failed to create user.");
        return;
      }
      form.reset();
      setShowAddTeam(false);
      if (result.data?.email && result.data?.password) {
        setCredentials({ email: result.data.email, password: result.data.password });
      }
    });
  }, []);

  const handleToggle = useCallback((userId: string, current: boolean) => {
    startTransition(async () => {
      const r = await toggleUserActive(userId, !current);
      if (!r.ok) setError(r.error ?? "Failed to update.");
    });
  }, []);

  const copyCreds = useCallback(async () => {
    if (!credentials) return;
    const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch { /* ignore */ }
  }, [credentials]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <div className="flex justify-end">
        <Button onClick={() => setShowAddTeam(true)} className="gap-1"><Plus className="h-4 w-4" /> Add Team User</Button>
      </div>

      {showAddTeam && (
        <form onSubmit={handleCreateTeam} className="space-y-3 rounded-lg border bg-white p-4 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> New Team User</h3>
            <button type="button" onClick={() => setShowAddTeam(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" name="fullName" required disabled={isPending} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required disabled={isPending} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="password">Password (leave blank to auto-generate; min 12 chars)</Label>
              <Input id="password" name="password" type="text" minLength={12} disabled={isPending} placeholder="Auto-generated if empty" />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="gap-1">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {isPending ? "Creating..." : "Create Team User"}
          </Button>
        </form>
      )}

      {credentials && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">Account created. Send these credentials securely.</p>
              <p className="font-mono text-xs">Email: {credentials.email}</p>
              <p className="font-mono text-xs">Password: {credentials.password}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={copyCreds} className="gap-1">
                {copyFlash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copyFlash ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCredentials(null)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="mt-2 text-xs">This is the only time you can view the password. Copy it now.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Linked Buyer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-zinc-400">No users yet.</TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.full_name ?? "\u2014"}</TableCell>
                <TableCell className="text-sm">{u.email ?? "\u2014"}</TableCell>
                <TableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${u.role === "team" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{u.buyer_name ?? "\u2014"}</TableCell>
                <TableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${u.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
                    {u.is_active ? "Active" : "Disabled"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleToggle(u.user_id, u.is_active)}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-400">
        To create a client account for a buyer: go to <a href="/buyers" className="text-indigo-600 hover:underline">/buyers</a>, edit the buyer with an email, and use &ldquo;Create Client Login&rdquo;. (Wired up in a follow-up prompt.)
      </p>
    </div>
  );
}
