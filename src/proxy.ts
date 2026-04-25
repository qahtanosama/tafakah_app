import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/setup", "/api/health", "/logout"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=disabled", req.url));
  }

  // Role-based route guards
  if (profile.role === "client") {
    if (pathname === "/" || !pathname.startsWith("/portal")) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  } else if (profile.role === "team") {
    if (pathname.startsWith("/portal")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
