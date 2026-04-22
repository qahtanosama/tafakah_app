import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MigrateClient from "./MigrateClient";
import { getDbCounts } from "./actions";

export const metadata = { title: "Data Migration \u2014 TAFAKAH" };

export default async function MigratePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) redirect("/");

  const countsResp = await getDbCounts();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold">Data Migration to Supabase</h1>
      <p className="mb-6 text-sm text-slate-500">
        Copy your localStorage data into the cloud database. Your localStorage is preserved as backup.
        Existing DB rows will NOT be overwritten.
      </p>
      <MigrateClient initialDbCounts={countsResp.ok ? (countsResp.counts ?? null) : null} initialDbError={countsResp.ok ? null : (countsResp.error ?? null)} />
    </div>
  );
}
