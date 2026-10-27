import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { formatDateTime, formatUnitCost } from "@/lib/format";
import { londonLocalToDate } from "@/lib/london-time";
import { canSeeCosts } from "@/lib/roles";
import { isUuid, paramPage, paramText } from "@/lib/search-params";
import {
  MOVEMENT_LABELS,
  type MovementType,
  signedQuantity,
} from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock movements" };

const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function MovementsPage(props: PageProps<"/stock/movements">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Movements searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Movements({
  searchParams,
}: {
  searchParams: PageProps<"/stock/movements">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const product = paramText(params.product);
  const typeParam = paramText(params.type);
  const type =
    typeParam && typeParam in MOVEMENT_LABELS
      ? (typeParam as MovementType)
      : undefined;
  const from = paramText(params.from);
  const to = paramText(params.to);
  const page = paramPage(params.page);

  const supabase = await createClient();
  let query = supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, occurred_at, source_type, source_id, note, product:products(id, name, sold_by), reason:adjustment_reasons(name), creator:profiles!stock_movements_created_by_fkey(full_name)",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (isUuid(product)) query = query.eq("product_id", product);
  if (type) query = query.eq("movement_type", type);
  // Dates are UK calendar days.
  const fromMoment =
    from && DATE.test(from) ? londonLocalToDate(`${from}T00:00`) : null;
  const toMoment =
    to && DATE.test(to) ? londonLocalToDate(`${to}T23:59`) : null;
  if (fromMoment) query = query.gte("occurred_at", fromMoment.toISOString());
  if (toMoment)
    query = query.lt(
      "occurred_at",
      new Date(toMoment.getTime() + 60_000).toISOString(),
    );
  const { data: movements, count } = await query;

  const ids = (movements ?? []).map((m) => m.id);
  const lineIds = (movements ?? []).flatMap((m) =>
    m.source_type === "delivery_line" && m.source_id ? [m.source_id] : [],
  );
  const salesLineIds = (movements ?? []).flatMap((m) =>
    m.source_type === "sales_line" && m.source_id ? [m.source_id] : [],
  );
  const showCosts = canSeeCosts(user.role);
  const [
    { data: lines },
    { data: costs },
    { data: productRow },
    { data: salesLines },
  ] = await Promise.all([
    lineIds.length
      ? supabase
          .from("supplier_invoice_lines")
          .select("id, invoice_id")
          .in("id", lineIds)
      : Promise.resolve({ data: [] as { id: string; invoice_id: string }[] }),
    showCosts && ids.length
      ? supabase
          .from("stock_movement_costs")
          .select("movement_id, unit_cost")
          .in("movement_id", ids)
      : Promise.resolve({
          data: [] as { movement_id: string; unit_cost: number }[],
        }),
    isUuid(product)
      ? supabase.from("products").select("name").eq("id", product).maybeSingle()
      : Promise.resolve({ data: null }),
    // Stock staff cannot read sales lines, so they see no link.
    salesLineIds.length
      ? supabase
          .from("sales_import_lines")
          .select("id, import_id")
          .in("id", salesLineIds)
      : Promise.resolve({ data: [] as { id: string; import_id: string }[] }),
  ]);
  const importForSalesLine = new Map(
    (salesLines ?? []).map((l) => [l.id, l.import_id]),
  );
  const invoiceForLine = new Map(
    (lines ?? []).map((l) => [l.id, l.invoice_id]),
  );
  const unitCost = new Map(
    (costs ?? []).map((c) => [c.movement_id, c.unit_cost]),
  );

  const sourceLink = (m: NonNullable<typeof movements>[number]) => {
    if (
      m.source_type === "delivery_line" &&
      m.source_id &&
      invoiceForLine.has(m.source_id)
    ) {
      return (
        <Link
          href={`/deliveries/${invoiceForLine.get(m.source_id)}`}
          className="hover:underline"
        >
          Delivery
        </Link>
      );
    }
    if (m.source_type === "adjustment") {
      return (
        <Link href="/adjustments" className="hover:underline">
          Adjustment
        </Link>
      );
    }
    if (m.source_type === "sales_line" && m.source_id) {
      const importId = importForSalesLine.get(m.source_id);
      return importId ? (
        <Link href={`/sales/${importId}`} className="hover:underline">
          Till sales
        </Link>
      ) : (
        "Till sales"
      );
    }
    if (m.source_type === "opening_stock" && m.source_id) {
      return (
        <Link href="/imports" className="hover:underline">
          Opening stock import
        </Link>
      );
    }
    return null;
  };

  return (
    <>
      <PageHeader
        title={
          productRow?.name ? `Movements: ${productRow.name}` : "Stock movements"
        }
        description="Every change to stock, newest first. Each one is permanent; mistakes are put right by a reversing movement."
      />

      <Form
        action="/stock/movements"
        className="flex flex-wrap items-end gap-3"
      >
        {isUuid(product) && (
          <input type="hidden" name="product" value={product} />
        )}
        <Field className="w-48">
          <FieldLabel htmlFor="type">Type</FieldLabel>
          <NativeSelect id="type" name="type" defaultValue={type ?? ""}>
            <NativeSelectOption value="">All types</NativeSelectOption>
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="from">From</FieldLabel>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field className="w-40">
          <FieldLabel htmlFor="to">To</FieldLabel>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </Field>
        <Button type="submit" variant="secondary">
          Show
        </Button>
        {isUuid(product) && (
          <Button variant="ghost" render={<Link href="/stock/movements" />}>
            All products
          </Button>
        )}
      </Form>

      {movements?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="text-right">Change</TableHead>
                {showCosts && (
                  <TableHead className="hidden text-right md:table-cell">
                    Unit cost
                  </TableHead>
                )}
                <TableHead className="hidden lg:table-cell">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(m.occurred_at)}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    {m.product && (
                      <Link
                        href={`/products/${m.product.id}`}
                        className="hover:underline"
                      >
                        {m.product.name}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    {MOVEMENT_LABELS[m.movement_type]}
                    {m.reason?.name && ` · ${m.reason.name}`}
                    <div className="text-xs text-muted-foreground">
                      {sourceLink(m)}
                      {m.note && <span> {m.note}</span>}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${m.quantity < 0 ? "text-destructive" : ""}`}
                  >
                    {signedQuantity(m.quantity, m.product?.sold_by)}
                  </TableCell>
                  {showCosts && (
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatUnitCost(unitCost.get(m.id))}
                    </TableCell>
                  )}
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {m.creator?.full_name ?? "System"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            pathname="/stock/movements"
            params={{
              product: isUuid(product) ? product : undefined,
              type,
              from,
              to,
            }}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No movements match.</p>
      )}
    </>
  );
}
