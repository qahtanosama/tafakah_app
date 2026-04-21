import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalClient from "./PortalClient";

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, full_name, is_active, buyer_id")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/login?error=disabled");
  if (profile.role !== "client") redirect("/");

  return <PortalClient fullName={profile.full_name ?? user.email ?? "client"} email={user.email ?? ""} />;
}
