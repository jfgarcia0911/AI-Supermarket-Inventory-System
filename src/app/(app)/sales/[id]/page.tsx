import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "@/lib/format";
import { isOwner } from "@/lib/roles";
import {
  describePeriod,
  SALES_LINE_BADGE,
  SALES_LINE_LABELS,
  type SalesLineStatus,
} from "@/lib/sales";
import { isUuid, paramPage, paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { reverseSalesImport } from "../actions";
import { ReverseForm } from "./reverse-form";

export const metadata: Metadata = { title: "Sales import" };

const PAGE_SIZE = 100;

export default function SalesImportPage(props: PageProps<"/sales/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SalesImport params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SalesImport({
  params,
  searchParams,
}: {
  params: PageProps<"/sales/[id]">["params"];
  searchParams: PageProps<"/sales/[id]">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const page = paramPage(query.page);
  const statusParam = paramText(query.status);
  const status =
    statusParam && statusParam in SALES_LINE_LABELS
      ? (statusParam as SalesLineStatus)
      : undefined;

  const supabase = await createClient();
  let linesQuery = supabase
    .from("sales_import_lines")
    .select(
      "id, row_number, sale_date, code, description, quantity, gross_value, status, note, product:products(id, name, size, sold_by)",
      { count: "exact" },
    )
    .eq("import_id", id)
    .order("row_number")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) linesQuery = linesQuery.eq("status", status);

  const [{ data: overview }, { data: imported }, { data: lines, count }] =
    await Promise.all([
      supabase
        .from("sales_import_overview")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("imports")
        .select(
          "rows_error, committer:profiles!imports_committed_by_fkey(full_name)",
        )
        .eq("id", id)
        .maybeSingle(),
      linesQuery,
    ]);
  if (!overview) notFound();

  const summary = (overview.summary ?? {}) as {
    reversed_at?: string;
    reversed_reason?: string;
  };
  const reversed = overview.status === "reversed";
  const stats: [string, string][] = [
    ["Lines", (overview.line_count ?? 0).toLocaleString("en-GB")],
    ["Matched", (overview.matched_count ?? 0).toLocaleString("en-GB")],
    ["Unmatched", (overview.unmatched_count ?? 0).toLocaleString("en-GB")],
    ["Ignored", (overview.ignored_count ?? 0).toLocaleString("en-GB")],
    ["Items and kg sold", formatQuantity(overview.units_sold)],
    ["Sales inc VAT", formatMoney(overview.gross_sales)],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Sales for{" "}
            {describePeriod(overview.period_start, overview.period_end)}
            {reversed && <Badge variant="destructive">Reversed</Badge>}
          </span>
        }
        description={[
          overview.file_name,
          `imported ${formatDateTime(overview.committed_at)}`,
          imported?.committer?.full_name &&
            `by ${imported.committer.full_name}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {(overview.unmatched_count ?? 0) > 0 && !reversed && (
          <Button variant="outline" render={<Link href="/sales/unmatched" />}>
            Match unmatched lines
          </Button>
        )}
      </PageHeader>

      {reversed && (
        <Alert variant="destructive">
          <AlertDescription>
            Reversed {formatDateTime(summary.reversed_at)}:{" "}
            {summary.reversed_reason}. None of its sales count towards stock any
            more.
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {(imported?.rows_error ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          {imported?.rows_error} rows with problems were skipped when it was
          imported.
        </p>
      )}

      <Form action={`/sales/${id}`} className="flex flex-wrap items-end gap-2">
        <NativeSelect
          name="status"
          defaultValue={status ?? ""}
          aria-label="Show"
          className="w-48"
        >
          <NativeSelectOption value="">All lines</NativeSelectOption>
          {(Object.keys(SALES_LINE_LABELS) as SalesLineStatus[]).map((s) => (
            <NativeSelectOption key={s} value={s}>
              {SALES_LINE_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead>Till line</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Sales
            </TableHead>
            <TableHead className="hidden lg:table-cell">Product</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(lines ?? []).map((line) => (
            <TableRow key={line.id}>
              <TableCell className="tabular-nums">{line.row_number}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {formatDate(line.sale_date)}
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal">
                {line.description ?? "—"}
                <div className="font-mono text-xs text-muted-foreground">
                  {line.code}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(line.quantity, line.product?.sold_by)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {formatMoney(line.gross_value)}
              </TableCell>
              <TableCell className="hidden max-w-56 truncate lg:table-cell">
                {line.product ? (
                  <Link
                    href={`/products/${line.product.id}`}
                    className="hover:underline"
                  >
                    {[line.product.name, line.product.size]
                      .filter(Boolean)
                      .join(" · ")}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <Badge variant={SALES_LINE_BADGE[line.status]}>
                  {SALES_LINE_LABELS[line.status]}
                </Badge>
                {line.note && (
                  <div className="mt-1 max-w-48 text-xs whitespace-normal text-muted-foreground">
                    {line.note}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationLinks
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
        pathname={`/sales/${id}`}
        params={{ status }}
      />

      {isOwner(user.role) && !reversed && (
        <Card>
          <CardHeader>
            <CardTitle>Reverse</CardTitle>
            <CardDescription>
              For a wrong file, such as the wrong day or a till export with
              mistakes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReverseForm action={reverseSalesImport.bind(null, id)} />
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/sales" className="hover:underline">
          Back to sales
        </Link>
      </p>
    </>
  );
}
