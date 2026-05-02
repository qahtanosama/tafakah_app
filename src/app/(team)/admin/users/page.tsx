import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listUsers } from "./actions";
import UsersAdminClient from "./UsersAdminClient";

export default async function AdminUsersPage() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) redirect("/?error=super_admin_required");

  const result = await listUsers();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold">User Administration</h1>
      <p className="mb-6 text-sm text-slate-500">
        Super admin only. Manage team and client accounts. Promotion to/from
        super_admin requires direct SQL — not exposed in this UI by design.
      </p>
      {result.ok ? (
        <UsersAdminClient
          users={result.users ?? []}
          currentUserId={result.currentUserId ?? guard.userId}
        />
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{result.error}</div>
      )}
    </div>
  );
}
