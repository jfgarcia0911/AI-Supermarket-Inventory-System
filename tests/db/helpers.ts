// Shared set-up for the database tests: clients signed in as the demo accounts.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;
export interface SignedIn {
  db: Client;
  id: string;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const password = process.env.DEMO_PASSWORD ?? "";

export function client(): Client {
  if (!url || !key || !password) {
    throw new Error(
      "Set the Supabase variables and DEMO_PASSWORD in .env.local.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signIn(email: string): Promise<SignedIn> {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(
      `${email}: ${error.message}. Run npm run db:seed-dev first.`,
    );
  return { db, id: data.user.id };
}

export async function signInAll() {
  const [owner, manager, staff, viewer] = await Promise.all([
    signIn("owner@example.com"),
    signIn("manager@example.com"),
    signIn("staff@example.com"),
    signIn("viewer@example.com"),
  ]);
  return { owner, manager, staff, viewer };
}
