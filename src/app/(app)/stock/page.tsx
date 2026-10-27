import {
  ArrowLeftRightIcon,
  ClipboardListIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getCategoryOptions } from "@/lib/catalogue";
import {
  formatDate,
  formatMoney,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { paramPage, paramText, searchTerm } from "@/lib/search-params";
import type { StockSummary } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock" };

const PAGE_SIZE = 50;

const SHOW_OPTIONS = {
  all: "All products",
  low: "Low stock",
  negative: "Below zero",
  not_counted: "No opening stock yet",
} as const;

export default function StockPage(props: PageProps<"/stock">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Stock searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Stock({
  searchParams,
}: {
  searchParams: PageProps<"/stock">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = paramText(params.q);
  const category = paramText(params.category);
  const showParam = paramText(params.show) ?? "all";
  const show = (
    showParam in SHOW_OPTIONS ? showParam : "all"
  ) as keyof typeof SHOW_OPTIONS;
  const page = paramPage(params.page);

  const supabase = await createClient();
  const [categories, { data: summaryData }] = await Promise.all([
    getCategoryOptions(),
    supabase.rpc("stock_summary"),
  ]);
  const summary = summaryData as unknown as StockSummary | null;

  let query = supabase
    .from("stock_overview")
    .select("*", { count: "exact" })
    .eq("active", true)
    .order("name")
    .order("size")
    .order("product_id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (show === "low") query = query.eq("is_low", true);
  if (show === "negative") query = query.lt("quantity_on_hand", 0);
  if (show === "not_counted") query = query.is("last_counted_at", null);
  if (category) {
    const ids = categories
      .filter((c) => c.path === category || c.path.startsWith(`${category} > `))
      .map((c) => c.id);
    query = query.in(
      "category_id",
      ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const term = q ? searchTerm(q) : "";
  if (term) {
    query = /^\d{8,14}$/.test(term)
      ? query.eq("primary_barcode", term)
      : query.or(
          `name.ilike.*${term}*,brand.ilike.*${term}*,till_code.eq.${term.toUpperCase()}`,
        );
  }
  const { data: rows, count } = await query;

  const showCosts = canSeeCosts(user.role);
  const costs = new Map<string, number | null>();
  if (showCosts && rows?.length) {
    const { data } = await supabase
      .from("stock_costs")
      .select("product_id, average_unit_cost")
      .in(
        "product_id",
        rows.flatMap((r) => (r.product_id ? [r.product_id] : [])),
      );
    for (const row of data ?? [])
      costs.set(row.product_id, row.average_unit_cost);
  }

  return (
    <>
      <PageHeader
        title="Stock"
        description="What the system expects to be on the shelves and in the stockroom."
      >
        {user.role !== "viewer" && (
          <Button variant="outline" render={<Link href="/adjustments" />}>
            <Trash2Icon />
            Record waste
          </Button>
        )}
        {canEditCatalogue(user.role) && (
          <Button
            variant="outline"
            render={<Link href="/imports/new?kind=opening_stock" />}
          >
            <ClipboardListIcon />
            Opening stock
          </Button>
        )}
        <Button variant="outline" render={<Link href="/stock/movements" />}>
          <ArrowLeftRightIcon />
          Movements
        </Button>
      </PageHeader>

      {summary && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/stock?show=low">
            <Badge variant={summary.low_stock ? "default" : "outline"}>
              {summary.low_stock} low
            </Badge>
          </Link>
          <Link href="/stock?show=negative">
            <Badge variant={summary.negative_stock ? "destructive" : "outline"}>
              {summary.negative_stock} below zero
            </Badge>
          </Link>
          <Link href="/stock?show=not_counted">
            <Badge variant="outline">
              {summary.never_counted} with no opening stock yet
            </Badge>
          </Link>
          {showCosts && summary.stock_value != null && (
            <Badge variant="secondary">
              Stock value {formatMoney(summary.stock_value)}
            </Badge>
          )}
        </div>
      )}

      <Form action="/stock" className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, brand, barcode or till code"
            aria-label="Search stock"
            className="pl-8"
          />
        </div>
        <NativeSelect
          name="category"
          defaultValue={category ?? ""}
          aria-label="Category"
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {categories.map((c) => (
            <NativeSelectOption key={c.id} value={c.path}>
              {c.path}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="show" defaultValue={show} aria-label="Show">
          {Object.entries(SHOW_OPTIONS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>

      {rows?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Reorder at
                </TableHead>
                {showCosts && (
                  <>
                    <TableHead className="hidden text-right lg:table-cell">
                      Average cost
                    </TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const soldBy = r.sold_by ?? "each";
                const onHand = r.quantity_on_hand ?? 0;
                const average = r.product_id ? costs.get(r.product_id) : null;
                return (
                  <TableRow key={r.product_id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/products/${r.product_id}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {[r.brand, r.size].filter(Boolean).join(" · ")}
                        {r.last_counted_at
                          ? ` · counted ${formatDate(r.last_counted_at)}`
                          : " · no opening stock yet"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {r.category_path}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          onHand < 0
                            ? "font-medium text-destructive"
                            : undefined
                        }
                      >
                        {formatQuantity(onHand, soldBy)}
                      </span>
                      {r.is_low && (
                        <div>
                          <Badge variant="outline">Low</Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatQuantity(r.reorder_point, soldBy)}
                    </TableCell>
                    {showCosts && (
                      <>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">
                          {formatUnitCost(average)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {average != null
                            ? formatMoney(Math.max(onHand, 0) * average)
                            : "—"}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationLinks
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            pathname="/stock"
            params={{ q, category, show: show === "all" ? undefined : show }}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No products match.</p>
      )}
    </>
  );
}
