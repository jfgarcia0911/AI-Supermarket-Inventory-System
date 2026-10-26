import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

/**
 * Supabase client with full access (it bypasses Row Level Security). Only for
 * user administration, after the caller has been checked to be an owner.
 * Never import this from a Client Component.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set.");
  }
  return createClient<Database>(supabaseUrl(), secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
