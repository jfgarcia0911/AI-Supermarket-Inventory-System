import "server-only";

import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client acting as the signed-in user, for Server Components and
 * Server Actions. Row Level Security applies to everything it does.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // A new client starts checking the saved session at once, which reads the
  // clock. During a background prefetch the cookies are readable, so they do
  // not pause rendering; io() does, keeping per-user data out of prerendered
  // page shells. In real requests and Server Actions it resolves immediately.
  await io();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
