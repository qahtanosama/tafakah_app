import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Users, UserCog, Activity, EyeOff, History } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  metadata: Record<string, unknown> | null;
}

async function loadStats() {
  const admin = createAdminClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    teamCount,
    clientCount,
    disabledCount,
    superCount,
    recentActions,
    latestAudit,
  ] = await Promise.all([
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "team").eq("is_active", true),
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "client").eq("is_active", true),
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("is_active", false),
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "super_admin").eq("is_active", true),
    admin.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    admin.from("audit_log").select("id, created_at, actor_email, action, target_email, metadata").order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    team: teamCount.count ?? 0,
    client: clientCount.count ?? 0,
    disabled: disabledCount.count ?? 0,
    superAdmin: superCount.count ?? 0,
    recent7d: recentActions.count ?? 0,
    audit: (latestAudit.data ?? []) as AuditRow[],
  };
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default async function SuperAdminDashboard() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) redirect("/?error=super_admin_required");

  const stats = await loadStats();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" />
            <h1 className="text-2xl font-bold">System Administration</h1>
            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">super_admin</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            System-wide management. All actions here are logged to the audit trail.
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Team accounts" value={stats.team} hint={`${stats.superAdmin} super admin${stats.superAdmin === 1 ? "" : "s"}`} />
        <StatCard label="Client accounts" value={stats.client} />
        <StatCard label="Disabled accounts" value={stats.disabled} />
        <StatCard label="Admin actions (7d)" value={stats.recent7d} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/users" className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900">
          <Users className="h-5 w-5 text-indigo-600" />
          <p className="mt-3 font-semibold group-hover:text-indigo-600">Manage Users</p>
          <p className="mt-1 text-xs text-zinc-500">Create, disable, or change roles for team and client accounts.</p>
        </Link>
        <Link href="/admin/audit" className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900">
          <Activity className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 font-semibold group-hover:text-emerald-600">Audit Log</p>
          <p className="mt-1 text-xs text-zinc-500">Searchable history of every administrative action.</p>
        </Link>
        <Link href="/admin/super/impersonate" className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900">
          <EyeOff className="h-5 w-5 text-amber-600" />
          <p className="mt-3 font-semibold group-hover:text-amber-600">View as Client</p>
          <p className="mt-1 text-xs text-zinc-500">Preview the portal as a specific client. Logged.</p>
        </Link>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-500" />
            <h2 className="font-semibold">Recent activity</h2>
          </div>
          <Link href="/admin/audit"><Button size="sm" variant="outline">View full log</Button></Link>
        </div>
        {stats.audit.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">No audit entries yet.</p>
        ) : (
          <ul className="divide-y">
            {stats.audit.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono text-xs text-zinc-400">{fmtTime(row.created_at)}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{row.action}</span>
                <span className="text-zinc-600">{row.actor_email ?? "system"}</span>
                {row.target_email && (
                  <>
                    <span className="text-xs text-zinc-400">→</span>
                    <span className="text-zinc-600">{row.target_email}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-between text-xs text-zinc-400">
        <span>Logged in as super admin: {guard.email}</span>
      </div>
    </div>
  );
}
