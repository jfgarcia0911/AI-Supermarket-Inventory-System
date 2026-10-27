import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { getCategoryOptions } from "@/lib/catalogue";
import { dateToLondonLocal, londonLocalToDate } from "@/lib/london-time";
import { createClient } from "@/lib/supabase/server";

import { NewCountForm } from "./new-count-form";

export const metadata: Metadata = { title: "Start a count" };

export default function NewCountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCount />
    </Suspense>
  );
}

/** Half an hour after tonight's close, or now if the shop has closed. */
function suggestedAsOf(tradingDayEnd: string, now: Date): string {
  const today = dateToLondonLocal(now).slice(0, 10);
  const [hours, minutes] = tradingDayEnd.split(":").map(Number);
  const close = londonLocalToDate(
    `${today}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  );
  if (!close) return dateToLondonLocal(now);
  const afterClose = new Date(close.getTime() + 30 * 60_000);
  return dateToLondonLocal(afterClose > now ? afterClose : now);
}

async function NewCount() {
  await requireRole("owner", "manager");
  const supabase = await createClient();
  const [categories, { data: store }] = await Promise.all([
    getCategoryOptions(),
    supabase
      .from("stores")
      .select("trading_day_end")
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <>
      <PageHeader
        title="Start a count"
        description="Staff count with their phones; you review the differences and approve."
      />
      <NewCountForm
        categories={categories.filter((c) => c.active)}
        defaultAsOf={suggestedAsOf(
          store?.trading_day_end ?? "22:00",
          new Date(),
        )}
      />
    </>
  );
}
