import { FileUpIcon, PencilIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { isUuid, paramPage, paramText, searchTerm } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { saveSupplierProduct, setSupplierActive } from "../actions";
import { SupplierProductForm } from "../supplier-product-form";

export const metadata: Metadata = { title: "Supplier" };

const PAGE_SIZE = 50;

export default function SupplierPage(props: PageProps<"/suppliers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Supplier params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Supplier({
  params,
  searchParams,
}: {
  params: PageProps<"/suppliers/[id]">["params"];
  searchParams: PageProps<"/suppliers/[id]">["searchParams"];
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const query = await searchParams;
  const q = paramText(query.q);
  const page = paramPage(query.page);

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("supplier_overview")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!supplier?.id) {
    notFound();
  }

  let linksQuery = supabase
    .from("supplier_products")
    .select(
      "id, supplier_code, supplier_description, units_per_case, is_preferred, product:products!inner(id, name, brand, size, sold_by)",
      { count: "exact" },
    )
    .eq("supplier_id", id)
    .eq("active", true)
    .order("supplier_code")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = q ? searchTerm(q) : "";
  if (term) {
    linksQuery = linksQuery.or(
      `supplier_code.ilike.*${term}*,supplier_description.ilike.*${term}*`,
    );
  }
  const { data: links, count } = await linksQuery;

  const canEdit = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);
  const costs = new Map<
    string,
    {
      case_cost: number | null;
      unit_cost: number | null;
      change_pct: number | null;
      effective_date: string | null;
    }
  >();
  if (showCosts && links?.length) {
    const { data } = await supabase
      .from("supplier_product_latest_costs")
      .select(
        "supplier_product_id, case_cost, unit_cost, change_pct, effective_date",
      )
      .in(
        "supplier_product_id",
        links.map((link) => link.id),
      );
    for (const row of data ?? []) {
      if (row.supplier_product_id) costs.set(row.supplier_product_id, row);
    }
  }

  const details: [string, React.ReactNode][] = [
    ["Our account number", supplier.account_number],
    ["Contact", supplier.contact_name],
    ["Phone", supplier.phone],
    ["Email", supplier.email],
    ["Delivery days", supplier.delivery_days],
    [
      "Lead time",
      supplier.lead_time_days != null
        ? `${supplier.lead_time_days} days`
        : null,
    ],
    [
      "Payment terms",
      supplier.payment_terms_days != null
        ? `${supplier.payment_terms_days} days`
        : null,
    ],
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {supplier.name}
            {!supplier.active && <Badge variant="outline">Switched off</Badge>}
          </span>
        }
        description={`${supplier.product_count ?? 0} products`}
      >
        {canEdit && (
          <>
            <Button
              variant="outline"
              render={
                <Link
                  href={`/imports/new?kind=supplier_products&supplier=${id}`}
                />
              }
            >
              <FileUpIcon />
              Import price list
            </Button>
            <Button
              variant="outline"
              render={<Link href={`/suppliers/${id}/edit`} />}
            >
              <PencilIcon />
              Edit
            </Button>
            <ActionButton
              variant="outline"
              action={setSupplierActive.bind(null, id, !supplier.active)}
              confirm={
                supplier.active
                  ? {
                      title: `Switch ${supplier.name} off?`,
                      description:
                        "Their history stays, but they will no longer appear when recording deliveries. You can switch them back on later.",
                      confirmLabel: "Switch off",
                    }
                  : undefined
              }
            >
              {supplier.active ? "Switch off" : "Switch on"}
            </ActionButton>
          </>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {supplier.notes && (
            <p className="mt-4 text-sm whitespace-pre-line">{supplier.notes}</p>
          )}
        </CardContent>
      </Card>

      {canEdit && supplier.active && (
        <Card>
          <CardHeader>
            <CardTitle>Add a product from this supplier</CardTitle>
            <CardDescription>
              Their code and case size let deliveries be matched to our
              products. For many products, import their price list instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierProductForm
              action={saveSupplierProduct.bind(null, id, null)}
              showCost={showCosts}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products from {supplier.name}</CardTitle>
          {showCosts && (
            <CardDescription>
              Costs are per case, before VAT. Change is against their previous
              cost.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Form action={`/suppliers/${id}`} className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Their code or description"
                aria-label="Search this supplier's products"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </Form>
          {links?.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Their code</TableHead>
                    <TableHead>Our product</TableHead>
                    <TableHead className="text-right">Case of</TableHead>
                    {showCosts && (
                      <>
                        <TableHead className="text-right">Case cost</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">
                          Unit cost
                        </TableHead>
                        <TableHead className="hidden text-right md:table-cell">
                          Change
                        </TableHead>
                      </>
                    )}
                    {canEdit && (
                      <TableHead className="text-right">Edit</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => {
                    const cost = costs.get(link.id);
                    return (
                      <TableRow key={link.id}>
                        <TableCell className="font-mono text-xs">
                          {link.supplier_code ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-72">
                          <Link
                            href={`/products/${link.product.id}`}
                            className="font-medium hover:underline"
                          >
                            {link.product.name}
                          </Link>
                          {link.is_preferred && (
                            <Badge variant="secondary" className="ml-2">
                              Preferred
                            </Badge>
                          )}
                          <div className="truncate text-xs text-muted-foreground">
                            {link.supplier_description ??
                              [link.product.brand, link.product.size]
                                .filter(Boolean)
                                .join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(
                            link.units_per_case,
                            link.product.sold_by,
                          )}
                        </TableCell>
                        {showCosts && (
                          <>
                            <TableCell className="text-right tabular-nums">
                              {formatMoney(cost?.case_cost)}
                              {cost?.effective_date && (
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(cost.effective_date)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                              {formatUnitCost(cost?.unit_cost)}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums md:table-cell">
                              <span
                                className={
                                  cost?.change_pct && cost.change_pct > 0
                                    ? "text-destructive"
                                    : undefined
                                }
                              >
                                {formatPercent(cost?.change_pct)}
                              </span>
                            </TableCell>
                          </>
                        )}
                        {canEdit && (
                          <TableCell className="text-right">
                            <Link
                              href={`/suppliers/${id}/products/${link.id}`}
                              className="text-sm hover:underline"
                            >
                              Edit
                            </Link>
                          </TableCell>
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
                pathname={`/suppliers/${id}`}
                params={{ q }}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {q
                ? "No products match that search."
                : "No products from this supplier yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
