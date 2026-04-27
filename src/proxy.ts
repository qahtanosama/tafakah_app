import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const PUBLIC_PATHS = ["/login", "/setup", "/api/health", "/logout"];
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

  // Role-based route guards.
  if (profile.role === "client") {
    if (!isPortalPath(pathname)) {
      const target = profile.preferred_language === "ar" ? "/ar/portal" : "/portal";
      return NextResponse.redirect(new URL(target, req.url));
    }
  } else if (profile.role === "team") {
    if (isPortalPath(pathname)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
