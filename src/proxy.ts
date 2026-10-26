import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * Runs before every page: keeps the sign-in session fresh and sends signed-out
 * visitors to the login page. This is only a first, optimistic check; every
 * page and action checks the user again (see src/lib/auth.ts).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  let redirectTo: URL | null = null;
  if (!signedIn && !isPublic(pathname)) {
    redirectTo = new URL("/login", request.url);
    if (pathname !== "/") {
      redirectTo.searchParams.set("next", pathname + search);
    }
  } else if (
    signedIn &&
    (pathname === "/login" || pathname === "/forgot-password")
  ) {
    redirectTo = new URL("/", request.url);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    // Keep any refreshed or cleared session cookies.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
