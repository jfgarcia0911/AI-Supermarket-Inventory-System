import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Signs out a user whose account was switched off, then explains why. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason =
    request.nextUrl.searchParams.get("reason") === "inactive"
      ? "?reason=inactive"
      : "";
  return NextResponse.redirect(
    new URL(`/login${reason}`, request.nextUrl.origin),
  );
}
