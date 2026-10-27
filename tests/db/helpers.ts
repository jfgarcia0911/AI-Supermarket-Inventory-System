// Shared set-up for the database tests: clients signed in as the demo accounts.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { withCheckDigit } from "@/lib/barcodes";
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

/** The barcode of the "Database test product". */
export const TEST_BARCODE = withCheckDigit("509999900001");

/**
 * The switched-off product the stock tests use (created the first time).
 * It is switched on while the tests run; call the returned function to
 * switch it off again.
 */
export async function useTestProduct(owner: SignedIn) {
  const { data: barcode } = await owner.db
    .from("product_barcodes")
    .select("product_id")
    .eq("barcode", TEST_BARCODE)
    .maybeSingle();
  let productId = barcode?.product_id;
  if (!productId) {
    const { data: category } = await owner.db
      .from("categories")
      .select("id")
      .limit(1)
      .single();
    const { data, error } = await owner.db.rpc("create_product", {
      p_name: "Database test product",
      p_size: "Do not sell",
      p_category_id: category!.id,
      p_vat_code: "S",
      p_barcode: TEST_BARCODE,
    });
    if (error) throw error;
    productId = data;
  }
  await owner.db.from("products").update({ active: true }).eq("id", productId);

  const onHand = async (): Promise<number> => {
    const { data } = await owner.db
      .from("stock_levels")
      .select("quantity_on_hand")
      .eq("product_id", productId)
      .maybeSingle();
    return Number(data?.quantity_on_hand ?? 0);
  };
  const switchOff = async () => {
    await owner.db
      .from("products")
      .update({ active: false })
      .eq("id", productId);
  };
  return { productId, onHand, switchOff };
}
