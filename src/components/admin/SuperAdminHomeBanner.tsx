import Link from "next/link";
import { ShieldCheck, Users, Activity, Eye, Sparkles, ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

interface Props {
  fullName: string | null;
}

async function loadStats() {
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [team, client, today] = await Promise.all([
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "team").eq("is_active", true),
    admin.from("users_profile").select("*", { count: "exact", head: true }).eq("role", "client").eq("is_active", true),
    admin.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
  ]);
  return {
    team: team.count ?? 0,
    client: client.count ?? 0,
    today: today.count ?? 0,
  };
}

const QUICK_ACTIONS = [
  { href: "/admin/super", label: "System Dashboard", icon: ShieldCheck },
  { href: "/admin/users", label: "Manage Users", icon: Users },
  { href: "/admin/audit", label: "Audit Log", icon: Activity },
  { href: "/admin/super/impersonate", label: "View as Client", icon: Eye },
];

export default async function SuperAdminHomeBanner({ fullName }: Props) {
  const stats = await loadStats();
  const displayName = fullName?.trim() || "Super Admin";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-purple-200/40 bg-gradient-to-br from-[#1B2A4A] via-[#241844] to-[#3A1B5B] p-6 text-white shadow-xl shadow-purple-900/10 sm:p-8">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-purple-500/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/40 bg-purple-500/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-purple-100 backdrop-blur-sm">
            <Sparkles className="h-3 w-3" />
            System Administrator
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, <span className="text-purple-200">{displayName}</span>
          </h2>
          <p className="mt-2 text-sm text-purple-100/80">
            System-wide management. Every action below is recorded in the audit log.
          </p>

          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
              <span className="font-mono text-base font-semibold text-purple-100">{stats.team}</span>
              <span className="ml-1.5 text-purple-100/70">team accounts</span>
            </li>
            <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
              <span className="font-mono text-base font-semibold text-purple-100">{stats.client}</span>
              <span className="ml-1.5 text-purple-100/70">clients</span>
            </li>
            <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
              <span className="font-mono text-base font-semibold text-purple-100">{stats.today}</span>
              <span className="ml-1.5 text-purple-100/70">actions today</span>
            </li>
          </ul>
        </div>
      </div>

      <nav className="relative mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium backdrop-blur-sm transition-all hover:border-purple-300/60 hover:bg-purple-500/20"
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-purple-200 transition-transform group-hover:scale-110" />
              {label}
            </span>
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-purple-200 opacity-60 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </Link>
        ))}
      </nav>
    </section>
  );
}
