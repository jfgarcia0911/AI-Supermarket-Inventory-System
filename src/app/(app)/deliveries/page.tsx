import { PackageOpenIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
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
import { requireUser } from "@/lib/auth";
import { DOCUMENT_LABELS, STATUS_BADGE, STATUS_LABELS } from "@/lib/deliveries";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { canSeeCosts } from "@/lib/roles";
import { isUuid, paramPage, paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deliveries" };

const PAGE_SIZE = 50;

const SHOW_OPTIONS = {
  open: "To do (being checked in or waiting to post)",
  posted: "Posted",
  void: "Void",
  all: "All",
} as const;

export default function DeliveriesPage(props: PageProps<"/deliveries">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Deliveries searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Deliveries({
  searchParams,
}: {
  searchParams: PageProps<"/deliveries">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showParam = paramText(params.show) ?? "open";
  const show = (
    showParam in SHOW_OPTIONS ? showParam : "open"
  ) as keyof typeof SHOW_OPTIONS;
  const supplier = paramText(params.supplier);
  const page = paramPage(params.page);

  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  let query = supabase
    .from("delivery_overview")
    .select("*", { count: "exact" })
    .order("delivered_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (show === "open") query = query.in("status", ["draft", "checked_in"]);
  if (show === "posted") query = query.eq("status", "posted");
  if (show === "void") query = query.eq("status", "void");
  if (isUuid(supplier)) query = query.eq("supplier_id", supplier);
  const { data: deliveries, count } = await query;

  const showCosts = canSeeCosts(user.role);

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Goods arriving from suppliers, and returns going back. Stock changes when a delivery is posted."
      >
        {user.role !== "viewer" && (
          <Button render={<Link href="/deliveries/new" />}>
            <PlusIcon />
            New delivery
          </Button>
        )}
      </PageHeader>

      <Form action="/deliveries" className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect name="show" defaultValue={show} aria-label="Show">
          {Object.entries(SHOW_OPTIONS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          name="supplier"
          defaultValue={supplier ?? ""}
          aria-label="Supplier"
        >
          <NativeSelectOption value="">All suppliers</NativeSelectOption>
          {(suppliers ?? []).map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>

      {deliveries?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arrived</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Paperwork
                </TableHead>
                <TableHead className="text-right">Units</TableHead>
                {showCosts && (
                  <TableHead className="hidden text-right md:table-cell">
                    Total
                  </TableHead>
                )}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/deliveries/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {formatDateTime(d.delivered_at)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {d.supplier_name}
                    {d.document_type === "credit_note" && (
                      <div className="text-xs text-muted-foreground">
                        {DOCUMENT_LABELS.credit_note}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">
                    {d.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(d.units_received)}
                    <div className="text-xs text-muted-foreground">
                      {d.line_count} {d.line_count === 1 ? "line" : "lines"}
                    </div>
                  </TableCell>
                  {showCosts && (
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatMoney(d.gross_total)}
                    </TableCell>
                  )}
                  <TableCell>
                    {d.status && (
                      <Badge variant={STATUS_BADGE[d.status]}>
                        {STATUS_LABELS[d.status]}
                      </Badge>
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
            pathname="/deliveries"
            params={{ show: show === "open" ? undefined : show, supplier }}
          />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpenIcon />
            </EmptyMedia>
            <EmptyTitle>
              {show === "open" ? "Nothing to do" : "No deliveries"}
            </EmptyTitle>
            <EmptyDescription>
              {show === "open"
                ? "Every delivery has been posted. Start a new one when goods arrive."
                : "Try a different filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
