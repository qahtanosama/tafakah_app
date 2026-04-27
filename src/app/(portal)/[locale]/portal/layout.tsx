import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";

export default async function PortalSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, full_name, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/login?error=disabled");
  if (profile.role !== "client") redirect("/");

  const fullName = profile.full_name ?? user.email ?? "Client";

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader fullName={fullName} email={user.email ?? ""} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</div>
      </main>
      <PortalFooter />
    </div>
  );
}
