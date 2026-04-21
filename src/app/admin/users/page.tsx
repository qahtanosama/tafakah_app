import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listUsers } from "./actions";
import UsersAdminClient from "./UsersAdminClient";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) {
    redirect("/");
  }

  const result = await listUsers();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold">User Administration</h1>
      <p className="mb-6 text-sm text-slate-500">Team accounts have full app access. Client accounts are limited to the portal view for a single buyer.</p>
      {result.ok ? (
        <UsersAdminClient users={result.users ?? []} />
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{result.error}</div>
      )}
    </div>
  );
}
