import { FileUpIcon, PackageIcon, PlusIcon, SearchIcon } from "lucide-react";
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { formatMoney } from "@/lib/format";
import { canEditCatalogue } from "@/lib/roles";
import { paramPage, paramText, searchTerm } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;

export default function ProductsPage(props: PageProps<"/products">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Products({
  searchParams,
}: {
  searchParams: PageProps<"/products">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = paramText(params.q);
  const category = paramText(params.category);
  const status = paramText(params.status) ?? "active";
  const page = paramPage(params.page);

  const supabase = await createClient();
  const categories = await getCategoryOptions();

  let query = supabase
    .from("product_overview")
    .select(
      "id, name, brand, size, category_path, sold_by, vat_code, sell_price, till_code, primary_barcode, active",
      { count: "exact" },
    )
    .order("name")
    .order("size")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status !== "all") {
    query = query.eq("active", status === "active");
  }
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
      ? query.contains("barcodes", [term])
      : query.or(
          `name.ilike.*${term}*,brand.ilike.*${term}*,till_code.eq.${term.toUpperCase()}`,
        );
  }

  const { data: products, count } = await query;
  const total = count ?? 0;
  const canEdit = canEditCatalogue(user.role);
  const filtered = Boolean(q || category || status !== "active");

  return (
    <>
      <PageHeader title="Products" description="Everything the shop sells.">
        {canEdit && (
          <>
            <Button
              variant="outline"
              render={<Link href="/imports/new?kind=products" />}
            >
              <FileUpIcon />
              Import
            </Button>
            <Button render={<Link href="/products/new" />}>
              <PlusIcon />
              Add product
            </Button>
          </>
        )}
      </PageHeader>

      <Form action="/products" className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, brand, barcode or till code"
            aria-label="Search products"
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
        <NativeSelect name="status" defaultValue={status} aria-label="Status">
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="inactive">Switched off</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </Form>

      {total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No products match" : "No products yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search or category."
                : "Import your product list from a spreadsheet, or add products one at a time."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canEdit && (
            <EmptyContent>
              <Button render={<Link href="/imports/new?kind=products" />}>
                Import products
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead>Barcode / till code</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden sm:table-cell">VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-72">
                    <Link
                      href={`/products/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.brand, p.size].filter(Boolean).join(" · ")}
                      {!p.active && (
                        <Badge variant="outline" className="ml-2">
                          Switched off
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {p.category_path}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.primary_barcode ??
                      (p.till_code ? `Till ${p.till_code}` : "—")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(p.sell_price)}
                    {p.sold_by === "kg" && p.sell_price != null && (
                      <span className="text-muted-foreground">/kg</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {p.vat_code}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            pathname="/products"
            params={{
              q,
              category,
              status: status === "active" ? undefined : status,
            }}
          />
        </>
      )}
    </>
  );
}
