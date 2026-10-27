import { FileUpIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/imports/fields";
import type { ImportSummary } from "@/lib/imports/schemas";
import { canEditCatalogue } from "@/lib/roles";
import { paramPage } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Imports" };

const PAGE_SIZE = 50;

export default function ImportsPage(props: PageProps<"/imports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Imports searchParams={props.searchParams} />
    </Suspense>
  );
}

function describe(kind: string, summary: Partial<ImportSummary>): string {
  if (kind === "products") {
    return `${summary.new_products ?? 0} new, ${summary.updated_products ?? 0} updated, ${summary.unchanged_products ?? 0} unchanged`;
  }
  if (kind === "supplier_products") {
    return `${summary.new_links ?? 0} new, ${summary.updated_links ?? 0} updated · ${summary.costs_recorded ?? 0} costs (${summary.price_increases ?? 0} increases)`;
  }
  if (kind === "opening_stock") {
    return `${summary.products_set ?? 0} products given opening stock`;
  }
  if (kind === "sales") {
    return `${summary.matched ?? 0} lines matched, ${summary.unmatched ?? 0} unmatched, ${summary.ignored ?? 0} ignored`;
  }
  return "";
}

async function Imports({
  searchParams,
}: {
  searchParams: PageProps<"/imports">["searchParams"];
}) {
  const user = await requireRole("owner", "manager", "viewer");
  const page = paramPage((await searchParams).page);

  const supabase = await createClient();
  const { data: imports, count } = await supabase
    .from("imports")
    .select(
      "id, import_type, file_name, committed_at, rows_ok, rows_error, summary, supplier:suppliers(id, name), committer:profiles(full_name)",
      { count: "exact" },
    )
    .order("committed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader
        title="Imports"
        description="Every spreadsheet brought into the system, newest first."
      >
        {canEditCatalogue(user.role) && (
          <Button render={<Link href="/imports/new" />}>
            <FileUpIcon />
            New import
          </Button>
        )}
      </PageHeader>

      {imports?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="hidden md:table-cell">Result</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="hidden sm:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(row.committed_at)}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <div className="font-medium">
                      {IMPORT_KIND_LABELS[row.import_type as ImportKind] ??
                        row.import_type}
                      {row.supplier && (
                        <>
                          {" · "}
                          <Link
                            href={`/suppliers/${row.supplier.id}`}
                            className="hover:underline"
                          >
                            {row.supplier.name}
                          </Link>
                        </>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.file_name}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {describe(
                      row.import_type,
                      row.summary as Partial<ImportSummary>,
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.rows_ok.toLocaleString("en-GB")}
                    {row.rows_error > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {row.rows_error} skipped
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {row.committer?.full_name ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            pathname="/imports"
            params={{}}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing has been imported yet.
        </p>
      )}
    </>
  );
}
