"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, UserPlus, Copy, Check, Loader2, X, KeyRound, ShieldCheck, Eye } from "lucide-react";
import Link from "next/link";
import {
  createTeamUser,
  toggleUserActive,
  changeUserRole,
  resetTeamUserPassword,
  type UserRow,
  type Role,
} from "./actions";

interface Credentials {
  email: string;
  password: string;
}

const ROLE_BADGE: Record<Role, string> = {
  super_admin: "border-purple-200 bg-purple-50 text-purple-700",
  team: "border-indigo-200 bg-indigo-50 text-indigo-700",
  client: "border-amber-200 bg-amber-50 text-amber-700",
};

type Filter = "all" | "super_admin" | "team" | "client";

export default function UsersAdminClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copyFlash, setCopyFlash] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (!q) return true;
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, filter, search]);

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

  const handleRoleChange = useCallback((userId: string, newRole: "team" | "client") => {
    if (!confirm(`Change this user's role to ${newRole}? This is logged.`)) return;
    startTransition(async () => {
      const r = await changeUserRole(userId, newRole);
      if (!r.ok) setError(r.error ?? "Failed to update.");
    });
  }, []);

  const handleResetPassword = useCallback((userId: string, email: string | null) => {
    if (!confirm(`Reset password for ${email ?? "this user"}? The new password is shown once.`)) return;
    startTransition(async () => {
      const r = await resetTeamUserPassword(userId);
      if (!r.ok) {
        setError(r.error ?? "Failed to reset password.");
        return;
      }
      if (r.data?.email && r.data?.password) {
        setCredentials({ email: r.data.email, password: r.data.password });
      }
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
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1 dark:bg-zinc-900">
          {(["all", "super_admin", "team", "client"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f ? "bg-indigo-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {f === "all" ? "All" : f === "super_admin" ? "Super" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or name…"
          className="max-w-xs"
        />
        <div className="ml-auto">
          <Button onClick={() => setShowAddTeam(true)} className="gap-1"><Plus className="h-4 w-4" /> Add Team User</Button>
        </div>
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
              <p className="font-semibold">Send these credentials securely.</p>
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
              <TableHead>Last Sign-in</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-zinc-400">No users match.</TableCell>
              </TableRow>
            ) : filtered.map((u) => {
              const isSelf = u.user_id === currentUserId;
              const isSuper = u.role === "super_admin";
              const lockMessage = isSelf
                ? "You cannot modify your own account."
                : isSuper
                  ? "Super-admin accounts can only be modified via SQL."
                  : null;
              return (
                <TableRow key={u.user_id} className={isSelf ? "bg-purple-50/40" : ""}>
                  <TableCell className="font-medium">
                    {u.full_name ?? "—"}
                    {isSelf && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-700">you</span>}
                  </TableCell>
                  <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role]}`}>
                      {u.role === "super_admin" ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> super_admin</span> : u.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{u.buyer_name ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${u.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {lockMessage ? (
                      <span className="text-xs text-zinc-400" title={lockMessage}>locked</span>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleToggle(u.user_id, u.is_active)}>
                          {u.is_active ? "Disable" : "Enable"}
                        </Button>
                        {u.role === "team" ? (
                          <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleRoleChange(u.user_id, "client")}>
                            ↓ Client
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleRoleChange(u.user_id, "team")}>
                            ↑ Team
                          </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleResetPassword(u.user_id, u.email)} className="gap-1">
                          <KeyRound className="h-3 w-3" /> Reset
                        </Button>
                        <Link href={`/admin/audit?actor=${encodeURIComponent(u.user_id)}`}>
                          <Button size="sm" variant="ghost" className="gap-1"><Eye className="h-3 w-3" /> Activity</Button>
                        </Link>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-400">
        To create a client account for a buyer: go to <a href="/buyers" className="text-indigo-600 hover:underline">/buyers</a>, edit the buyer with an email, and use &ldquo;Create Client Login&rdquo;.
      </p>
    </div>
  );
}
