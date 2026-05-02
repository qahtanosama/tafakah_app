import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  "login",
  "logout",
  "role_change",
  "password_reset",
  "account_create",
  "account_disable",
  "account_enable",
  "impersonation_start",
  "impersonation_end",
  "client_login_create",
];

const RANGE_OPTIONS: Record<string, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": null,
};

interface AuditRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  target_resource_type: string | null;
  target_resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

interface SearchParams {
  range?: string;
  action?: string;
  actor?: string;
  target?: string;
  page?: string;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) redirect("/?error=super_admin_required");

  const sp = await searchParams;
  const range = sp.range && sp.range in RANGE_OPTIONS ? sp.range : "7d";
  const actionFilter = sp.action ?? "";
  const actorSearch = (sp.actor ?? "").trim();
  const targetSearch = (sp.target ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const admin = createAdminClient();
  let query = admin
    .from("audit_log")
    .select(
      "id, created_at, actor_user_id, actor_email, actor_role, action, target_user_id, target_email, target_resource_type, target_resource_id, metadata, ip_address",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  const rangeMs = RANGE_OPTIONS[range];
  if (rangeMs !== null && rangeMs !== undefined) {
    query = query.gte("created_at", new Date(Date.now() - rangeMs).toISOString());
  }
  if (actionFilter) query = query.eq("action", actionFilter);
  if (actorSearch) {
    if (actorSearch.includes("@")) {
      query = query.ilike("actor_email", `%${actorSearch}%`);
    } else if (/^[0-9a-f-]{8,}$/i.test(actorSearch)) {
      query = query.eq("actor_user_id", actorSearch);
    } else {
      query = query.ilike("actor_email", `%${actorSearch}%`);
    }
  }
  if (targetSearch) {
    if (targetSearch.includes("@")) {
      query = query.ilike("target_email", `%${targetSearch}%`);
    } else if (/^[0-9a-f-]{8,}$/i.test(targetSearch)) {
      query = query.eq("target_user_id", targetSearch);
    } else {
      query = query.ilike("target_email", `%${targetSearch}%`);
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await query.range(from, to);

  const rows = (data ?? []) as AuditRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: Partial<SearchParams>): string {
    const params = new URLSearchParams();
    const merged: SearchParams = { range, action: actionFilter, actor: actorSearch, target: targetSearch, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-8">
      <header className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-emerald-600" />
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <span className="ml-auto text-xs text-zinc-500">{total.toLocaleString()} entries · super_admin</span>
      </header>

      <form className="grid gap-3 rounded-lg border bg-white p-3 dark:bg-zinc-900 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600">Range</span>
          <select name="range" defaultValue={range} className="rounded border px-2 py-1 text-sm">
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600">Action</span>
          <select name="action" defaultValue={actionFilter} className="rounded border px-2 py-1 text-sm">
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600">Actor (email or user id)</span>
          <input name="actor" defaultValue={actorSearch} className="rounded border px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-600">Target (email or user id)</span>
          <input name="target" defaultValue={targetSearch} className="rounded border px-2 py-1 text-sm" />
        </label>
        <div className="flex items-end justify-end gap-2 sm:col-span-4">
          <Link href="/admin/audit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">Reset</Link>
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">Apply filters</button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load audit log: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-zinc-400">No entries.</TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-500">{fmtTime(r.created_at)}</TableCell>
                <TableCell className="text-sm">
                  <div>{r.actor_email ?? <span className="text-zinc-400">(system)</span>}</div>
                  {r.actor_role && <div className="text-xs text-zinc-400">{r.actor_role}</div>}
                </TableCell>
                <TableCell>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-800">{r.action}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {r.target_email ?? r.target_resource_id ?? <span className="text-zinc-400">—</span>}
                  {r.target_resource_type && <div className="text-xs text-zinc-400">{r.target_resource_type}</div>}
                </TableCell>
                <TableCell>
                  <details>
                    <summary className="cursor-pointer text-xs text-indigo-600 hover:underline">View</summary>
                    <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-zinc-50 p-2 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{JSON.stringify(r.metadata ?? {}, null, 2)}</pre>
                  </details>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500">{r.ip_address ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Page {page} of {totalPages}</span>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link href={buildHref({ page: String(page - 1) })} className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-zinc-50">
              <ChevronLeft className="h-3 w-3" /> Prev
            </Link>
          )}
          {page < totalPages && (
            <Link href={buildHref({ page: String(page + 1) })} className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-zinc-50">
              Next <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
