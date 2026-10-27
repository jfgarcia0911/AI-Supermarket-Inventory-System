import type { Metadata } from "next";
import Link from "next/link";
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
import { COUNT_SCOPE_LABELS } from "@/lib/counts";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { canSeeCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

import { BackToReports, RangeForm, rangeFrom } from "../report-bits";

export const metadata: Metadata = { title: "Count differences" };

export default function CountsReportPage(props: PageProps<"/reports/counts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CountsReport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function CountsReport({
  searchParams,
}: {
  searchParams: PageProps<"/reports/counts">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const showCosts = canSeeCosts(user.role);
  const params = await searchParams;
  const supabase = await createClient();
  const range = rangeFrom(params);
  const { data: rows } = await supabase.rpc("report_counts", {
    p_from: range.from,
    p_to: range.to,
  });

  return (
    <>
      <PageHeader
        title="Count differences"
        description="Approved counts in the period: how many products differed from the expected stock, and by how much."
      />
      <RangeForm path="/reports/counts" report="counts" range={range} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Count</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead className="text-right">Different</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Found
            </TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Missing
            </TableHead>
            {showCosts && (
              <TableHead className="text-right">Net value</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No counts were approved in this period.
              </TableCell>
            </TableRow>
          )}
          {(rows ?? []).map((r) => (
            <TableRow key={r.count_id}>
              <TableCell className="whitespace-normal">
                <Link
                  href={`/counts/${r.count_id}`}
                  className="font-medium hover:underline"
                >
                  {r.name}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {COUNT_SCOPE_LABELS[r.scope]} · {formatDateTime(r.as_of)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.products ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.with_difference ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {formatQuantity(r.units_added)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {formatQuantity(r.units_removed)}
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
