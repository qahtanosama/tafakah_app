import { redirect } from "next/navigation";
import { EyeOff } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ImpersonateRowAction } from "./ImpersonateRowAction";

export const dynamic = "force-dynamic";

interface ClientRow {
  user_id: string;
  full_name: string | null;
  buyer_id: string | null;
  is_active: boolean;
  email: string | null;
  buyer_name: string | null;
  buyer_country: string | null;
}

export default async function ImpersonatePage() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) redirect("/?error=super_admin_required");

  const admin = createAdminClient();
  const [{ data: profiles }, { data: authList }, { data: buyers }] = await Promise.all([
    admin.from("users_profile").select("user_id, full_name, buyer_id, is_active").eq("role", "client"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("buyers").select("id, company_name, country"),
  ]);

  const emailById = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    if (u.id && u.email) emailById.set(u.id, u.email);
  }
  const buyerById = new Map<string, { name: string; country: string | null }>();
  for (const b of buyers ?? []) {
    buyerById.set(b.id as string, { name: (b.company_name as string) ?? "", country: (b.country as string | null) ?? null });
  }

  const rows: ClientRow[] = (profiles ?? []).map((p) => {
    const buyer = p.buyer_id ? buyerById.get(p.buyer_id as string) : null;
    return {
      user_id: p.user_id as string,
      full_name: (p.full_name as string | null) ?? null,
      buyer_id: (p.buyer_id as string | null) ?? null,
      is_active: !!p.is_active,
      email: emailById.get(p.user_id as string) ?? null,
      buyer_name: buyer?.name ?? null,
      buyer_country: buyer?.country ?? null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-8">
      <header className="flex items-center gap-2">
        <EyeOff className="h-5 w-5 text-amber-600" />
        <h1 className="text-2xl font-bold">View as Client</h1>
      </header>
      <p className="text-sm text-slate-500">
        Impersonate a client account to preview the portal as they see it. Sessions
        last up to 1 hour and are logged. Impersonating other team or super-admin
        users is intentionally not supported from this UI.
      </p>

      <div className="overflow-x-auto rounded-lg border bg-white dark:bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-zinc-400">No client accounts yet.</TableCell>
              </TableRow>
            ) : rows.map((c) => (
              <TableRow key={c.user_id}>
                <TableCell className="font-medium">{c.buyer_name ?? c.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{c.email ?? "—"}</TableCell>
                <TableCell className="text-sm text-zinc-500">{c.buyer_country ?? "—"}</TableCell>
                <TableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${c.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
                    {c.is_active ? "Active" : "Disabled"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <ImpersonateRowAction
                    userId={c.user_id}
                    label={c.email ?? c.full_name ?? c.user_id}
                    disabled={!c.is_active || !c.buyer_id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
