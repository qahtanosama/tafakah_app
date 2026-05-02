import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordLogoutEvent } from "../login/log-login";

async function handle(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (user) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("users_profile")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      await recordLogoutEvent(user.id, user.email ?? null, (profile?.role as string | undefined) ?? null);
    } catch (err) {
      console.error("[logout] failed to log audit event:", err);
    }
  }

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url));
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
