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
import { createClient } from "@/lib/supabase/server";

import { BackToReports, RangeForm, rangeFrom } from "../report-bits";

export const metadata: Metadata = { title: "Waste and adjustments" };

export default function WasteReportPage(props: PageProps<"/reports/waste">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WasteReport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WasteReport({
  searchParams,
}: {
  searchParams: PageProps<"/reports/waste">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const showCosts = canSeeCosts(user.role);
  const params = await searchParams;
  const supabase = await createClient();
  const range = rangeFrom(params);
  const { data: rows } = await supabase.rpc("report_adjustments_by_reason", {
    p_from: range.from,
    p_to: range.to,
  });

  return (
    <>
      <PageHeader
        title="Waste and adjustments"
        description="Approved adjustments in the period, by reason. Value is at the cost when they happened: negative means stock written off."
      />
      <RangeForm path="/reports/waste" report="waste" range={range} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Adjustments</TableHead>
            <TableHead className="text-right">Taken out</TableHead>
            <TableHead className="text-right">Added</TableHead>
            {showCosts && <TableHead className="text-right">Value</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No adjustments in this period.
              </TableCell>
            </TableRow>
          )}
          {(rows ?? []).map((r) => (
            <TableRow key={r.reason}>
              <TableCell>
                {r.reason}
                {(r.waiting ?? 0) > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {r.waiting} waiting for approval
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.adjustments ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(r.units_out)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(r.units_in)}
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
