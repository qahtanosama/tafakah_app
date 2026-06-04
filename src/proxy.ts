import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const PUBLIC_PATHS = ["/welcome", "/login", "/setup", "/api/health", "/logout", "/logo.png", "/fonts"];
const intlMiddleware = createIntlMiddleware(routing);

function stripLocale(pathname: string): { locale: string | null; rest: string } {
  for (const loc of routing.locales) {
    if (pathname === `/${loc}`) return { locale: loc, rest: "/" };
    if (pathname.startsWith(`/${loc}/`)) return { locale: loc, rest: pathname.slice(loc.length + 1) };
  }
  return { locale: null, rest: pathname };
}

function isPortalPath(pathname: string): boolean {
  const { rest } = stripLocale(pathname);
  return rest === "/portal" || rest.startsWith("/portal/");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pass through public paths and Next internals.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Run next-intl FIRST for any path that may carry a locale (i.e. portal routes).
  // The intl middleware handles locale detection / redirects for portal-prefixed URLs.
  let res: NextResponse;
  if (isPortalPath(pathname)) {
    res = intlMiddleware(req);
  } else {
    res = NextResponse.next();
  }

  // Auth check (cookies travel via the response object).
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
    // Unauthenticated root → show the welcome/landing page while keeping the
    // URL at `/` (rewrite, not redirect). Deep links keep the /login?next=…
    // flow so the user returns to where they were headed after signing in.
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/welcome", req.url));
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active, preferred_language")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=disabled", req.url));
  }

  // Super-admin-only paths. Team users hitting these get redirected home.
  // (Note: super_admin can still hit them — they pass the check below.)
  const SUPER_ONLY_PREFIXES = ["/admin/super", "/admin/users", "/admin/audit"];
  if (SUPER_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (profile.role !== "super_admin") {
      return NextResponse.redirect(new URL("/?error=super_admin_required", req.url));
    }
  }

  // Role-based route guards.
  if (profile.role === "client") {
    if (!isPortalPath(pathname)) {
      const target = profile.preferred_language === "ar" ? "/ar/portal" : "/portal";
      return NextResponse.redirect(new URL(target, req.url));
    }
  } else if (profile.role === "team" || profile.role === "super_admin") {
    // Both team and super_admin live on the team-side app. Bounce them out of
    // the client portal.
    if (isPortalPath(pathname)) {
      // Allowance for impersonation: a super_admin actively impersonating a
      // client may legitimately need to view /portal pages. The cookie is set
      // by the impersonateUser server action and validated against
      // impersonation_sessions on each portal page render (see lib/impersonation).
      const impersonationCookie = req.cookies.get("sb-impersonation-target")?.value;
      if (!(profile.role === "super_admin" && impersonationCookie)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
