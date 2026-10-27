import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatMoney, formatQuantity } from "@/lib/format";
import { canSeeCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

import { BackToReports, DownloadButton, exportHref } from "../report-bits";

export const metadata: Metadata = { title: "Stock on hand and value" };

export default function StockReportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockReport />
    </Suspense>
  );
}

async function StockReport() {
  const user = await requireRole("owner", "manager", "viewer");
  const showCosts = canSeeCosts(user.role);
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("report_stock_by_department");
  const totals = (rows ?? []).reduce(
    (sum, r) => ({
      products: sum.products + (r.products ?? 0),
      units: sum.units + (r.units ?? 0),
      value: sum.value + (r.value ?? 0),
    }),
    { products: 0, units: 0, value: 0 },
  );

  return (
    <>
      <PageHeader
        title="Stock on hand and value"
        description="Estimated stock now, by department. Products below zero count as none; value is at average cost."
      >
        <DownloadButton
          href={exportHref("stock")}
          label="Every product for Excel"
        />
      </PageHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead className="text-right">Items and kg</TableHead>
            {showCosts && <TableHead className="text-right">Value</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((r) => (
            <TableRow key={r.department}>
              <TableCell>{r.department}</TableCell>
              <TableCell className="text-right tabular-nums">
                {(r.products ?? 0).toLocaleString("en-GB")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(r.units)}
              </TableCell>
              {showCosts && (
                <TableCell className="text-right tabular-nums">
                  {formatMoney(r.value)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">
              {totals.products.toLocaleString("en-GB")}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatQuantity(totals.units)}
            </TableCell>
            {showCosts && (
              <TableCell className="text-right tabular-nums">
                {formatMoney(totals.value)}
              </TableCell>
            )}
          </TableRow>
        </TableFooter>
      </Table>
      <BackToReports />
    </>
  );
}
