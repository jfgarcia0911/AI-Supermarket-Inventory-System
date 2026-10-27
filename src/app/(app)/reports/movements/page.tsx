import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatMoney, formatQuantity } from "@/lib/format";
import { canSeeCosts } from "@/lib/roles";
import { MOVEMENT_LABELS } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

import { BackToReports, RangeForm, rangeFrom } from "../report-bits";

export const metadata: Metadata = { title: "Stock movements" };

export default function MovementsReportPage(
  props: PageProps<"/reports/movements">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MovementsReport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function MovementsReport({
  searchParams,
}: {
  searchParams: PageProps<"/reports/movements">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const showCosts = canSeeCosts(user.role);
  const params = await searchParams;
  const supabase = await createClient();
  const range = rangeFrom(params);
  const { data: rows } = await supabase.rpc("report_movement_totals", {
    p_from: range.from,
    p_to: range.to,
  });

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Every change to stock in the period, added up by kind. The download has each product's stock at the start and end, and what changed it."
      />
      <RangeForm path="/reports/movements" report="movements" range={range} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Items and kg</TableHead>
            {showCosts && (
              <TableHead className="text-right">Value at cost</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                Nothing moved in this period.
              </TableCell>
            </TableRow>
          )}
          {(rows ?? []).map((r) => (
            <TableRow key={r.movement_type}>
              <TableCell>{MOVEMENT_LABELS[r.movement_type]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.lines ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(r.quantity)}
              </TableCell>
              {showCosts && (
                <TableCell className="text-right tabular-nums">
                  {formatMoney(r.value)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <BackToReports />
    </>
  );
}
