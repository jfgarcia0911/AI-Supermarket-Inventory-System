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

export const metadata: Metadata = { title: "Deliveries report" };

export default function DeliveriesReportPage(
  props: PageProps<"/reports/deliveries">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DeliveriesReport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DeliveriesReport({
  searchParams,
}: {
  searchParams: PageProps<"/reports/deliveries">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const showCosts = canSeeCosts(user.role);
  const params = await searchParams;
  const supabase = await createClient();
  const range = rangeFrom(params);
  const { data: rows } = await supabase.rpc("report_deliveries_by_supplier", {
    p_from: range.from,
    p_to: range.to,
  });

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Posted deliveries and returns in the period, by supplier. Problem lines are short, damaged, substituted or extra; you may be able to claim a credit."
      />
      <RangeForm path="/reports/deliveries" report="deliveries" range={range} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-right">Deliveries</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Returns
            </TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Items and kg
            </TableHead>
            <TableHead className="text-right">Problem lines</TableHead>
            {showCosts && (
              <TableHead className="text-right">Before VAT</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No deliveries were posted for this period.
              </TableCell>
            </TableRow>
          )}
          {(rows ?? []).map((r) => (
            <TableRow key={r.supplier}>
              <TableCell>{r.supplier}</TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.deliveries ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {(r.returns ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {formatQuantity(r.units_received)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.problem_lines ?? 0).toLocaleString("en-GB")}
              </TableCell>
              {showCosts && (
                <TableCell className="text-right tabular-nums">
                  {formatMoney(r.net_total)}
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
