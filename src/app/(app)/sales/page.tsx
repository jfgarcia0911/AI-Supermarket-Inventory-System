import {
  CalendarX2Icon,
  CircleCheckIcon,
  FileUpIcon,
  ReceiptIcon,
  SearchXIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { canEditCatalogue } from "@/lib/roles";
import {
  describeMissingDays,
  describePeriod,
  type SalesCoverage,
} from "@/lib/sales";
import { paramPage } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sales" };

const PAGE_SIZE = 50;

export default function SalesPage(props: PageProps<"/sales">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Sales searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Sales({
  searchParams,
}: {
  searchParams: PageProps<"/sales">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const page = paramPage((await searchParams).page);
  const canEdit = canEditCatalogue(user.role);

  const supabase = await createClient();
  const [{ data: coverageData }, { data: imports, count }] = await Promise.all([
    supabase.rpc("sales_coverage"),
    supabase
      .from("sales_import_overview")
      .select(
        "id, file_name, period_start, period_end, status, line_count, matched_count, unmatched_count, ignored_count, units_sold, gross_sales",
        { count: "exact" },
      )
      .order("period_end", { ascending: false })
      .order("committed_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
  ]);
  const coverage = coverageData as unknown as SalesCoverage | null;

  return (
    <>
      <PageHeader
        title="Sales"
        description="The till's daily sales. Each import takes what was sold off stock, dated at the end of that trading day."
      >
        {coverage && coverage.unmatched_lines > 0 && (
          <Button variant="outline" render={<Link href="/sales/unmatched" />}>
            <SearchXIcon />
            Unmatched ({coverage.unmatched_lines.toLocaleString("en-GB")})
          </Button>
        )}
        {canEdit && (
          <Button render={<Link href="/imports/new?kind=sales" />}>
            <FileUpIcon />
            Import sales
          </Button>
        )}
      </PageHeader>

      {coverage &&
        (coverage.missing_count > 0 ? (
          <Alert variant="destructive">
            <CalendarX2Icon />
            <AlertTitle>
              Sales missing for {coverage.missing_count}{" "}
              {coverage.missing_count === 1 ? "day" : "days"}
            </AlertTitle>
            <AlertDescription>
              {describeMissingDays(
                coverage.missing_days,
                coverage.missing_count,
                7,
              )}
              . Stock figures are too high until these are imported.
            </AlertDescription>
          </Alert>
        ) : coverage.imported_through ? (
          <Alert>
            <CircleCheckIcon />
            <AlertTitle>
              Sales imported up to {formatDate(coverage.imported_through)}
            </AlertTitle>
            <AlertDescription>No days are missing.</AlertDescription>
          </Alert>
        ) : null)}

      {coverage && coverage.unmatched_lines > 0 && (
        <p className="text-sm">
          <Link href="/sales/unmatched" className="font-medium underline">
            {coverage.unmatched_lines.toLocaleString("en-GB")} till lines
          </Link>{" "}
          ({coverage.unmatched_codes}{" "}
          {coverage.unmatched_codes === 1 ? "code" : "codes"}) don&apos;t match
          a product yet, so they haven&apos;t come off stock.
        </p>
      )}

      {imports?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sales for</TableHead>
                <TableHead className="hidden md:table-cell">File</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Unmatched
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Items and kg sold
                </TableHead>
                <TableHead className="text-right">Sales inc VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/sales/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {describePeriod(row.period_start, row.period_end)}
                    </Link>
                    {row.status === "reversed" && (
                      <Badge variant="destructive" className="ml-2">
                        Reversed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
                    {row.file_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(row.line_count ?? 0).toLocaleString("en-GB")}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {row.unmatched_count ? (
                      <span className="text-destructive">
                        {row.unmatched_count.toLocaleString("en-GB")}
                      </span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {formatQuantity(row.units_sold)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.gross_sales)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            pathname="/sales"
            params={{}}
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>No sales imported yet</EmptyTitle>
            <EmptyDescription>
              Export yesterday&apos;s sales from the till as a CSV file and
              import it here every morning.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
