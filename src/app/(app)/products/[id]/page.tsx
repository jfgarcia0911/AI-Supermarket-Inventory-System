import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { getVatRates, marginPercent, priceExVat } from "@/lib/catalogue";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import {
  addBarcode,
  removeBarcode,
  setPrimaryBarcode,
  setProductActive,
} from "../actions";
import { AddBarcodeForm } from "./add-barcode-form";
import { StockCard } from "./stock-card";

export const metadata: Metadata = { title: "Product" };

const PACK_LABELS = {
  unit: "Single item",
  case: "Case",
  outer: "Outer",
} as const;

export default function ProductPage(props: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Product params={props.params} />
    </Suspense>
  );
}

async function Product({
  params,
}: {
  params: PageProps<"/products/[id]">["params"];
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const [
    { data: product },
    { data: barcodes },
    { data: links },
    { data: prices },
    vatRates,
  ] = await Promise.all([
    supabase.from("product_overview").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("product_barcodes")
      .select("id, barcode, pack_type, units_per_pack, is_primary")
      .eq("product_id", id)
      .eq("active", true)
      .order("is_primary", { ascending: false })
      .order("pack_type")
      .order("created_at"),
    supabase
      .from("supplier_products")
      .select(
        "id, supplier_code, supplier_description, units_per_case, is_preferred, supplier:suppliers(id, name)",
      )
      .eq("product_id", id)
      .eq("active", true)
      .order("is_preferred", { ascending: false }),
    supabase
      .from("sell_price_history")
      .select("id, sell_price, effective_from, source")
      .eq("product_id", id)
      .order("effective_from", { ascending: false })
      .limit(10),
    getVatRates(),
  ]);
  if (!product || !product.id) {
    notFound();
  }

  const canEdit = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);
  const soldBy = product.sold_by ?? "each";
  const vat = vatRates.find((rate) => rate.code === product.vat_code);
  const sellExVat =
    product.sell_price != null
      ? priceExVat(product.sell_price, vat?.rate_pct ?? 0)
      : null;

  const costs = new Map<
    string,
    {
      case_cost: number | null;
      unit_cost: number | null;
      change_pct: number | null;
    }
  >();
  if (showCosts && links?.length) {
    const { data } = await supabase
      .from("supplier_product_latest_costs")
      .select("supplier_product_id, case_cost, unit_cost, change_pct")
      .in(
        "supplier_product_id",
        links.map((link) => link.id),
      );
    for (const row of data ?? []) {
      if (row.supplier_product_id) costs.set(row.supplier_product_id, row);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {product.name}
            {!product.active && <Badge variant="outline">Switched off</Badge>}
          </span>
        }
        description={[product.brand, product.size, product.category_path]
          .filter(Boolean)
          .join(" · ")}
      >
        {canEdit && (
          <>
            <Button
              variant="outline"
              render={<Link href={`/products/${id}/edit`} />}
            >
              <PencilIcon />
              Edit
            </Button>
            <ActionButton
              variant="outline"
              action={setProductActive.bind(null, id, !product.active)}
              confirm={
                product.active
                  ? {
                      title: "Switch this product off?",
                      description:
                        "It stays in the history but disappears from lists and imports will not match it. You can switch it back on later.",
                      confirmLabel: "Switch off",
                    }
                  : undefined
              }
            >
              {product.active ? "Switch off" : "Switch on"}
            </ActionButton>
          </>
        )}
      </PageHeader>

      <StockCard
        productId={id}
        soldBy={soldBy}
        active={product.active ?? true}
        reorderPoint={product.reorder_point}
        role={user.role}
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Selling price (inc VAT)">
              {formatMoney(product.sell_price)}
              {soldBy === "kg" && product.sell_price != null && " per kg"}
            </Detail>
            <Detail label="Before VAT">{formatUnitCost(sellExVat)}</Detail>
            <Detail label="VAT">
              {vat ? `${vat.name} (${vat.rate_pct}%)` : product.vat_code}
            </Detail>
            <Detail label="Sold by">
              {soldBy === "kg" ? "Weight (kg)" : "Each"}
            </Detail>
            <Detail label="Reorder point">
              {formatQuantity(product.reorder_point, soldBy)}
            </Detail>
            <Detail label="Reorder quantity">
              {formatQuantity(product.reorder_qty, soldBy)}
            </Detail>
            <Detail label="Till code">{product.till_code ?? "—"}</Detail>
            <Detail label="Category">{product.category_path}</Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Barcodes</CardTitle>
          <CardDescription>
            The main barcode is the one on a single item. Case barcodes let
            staff scan a whole case at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {barcodes?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  {canEdit && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {barcodes.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">
                      {b.barcode}
                      {b.is_primary && (
                        <Badge variant="secondary" className="ml-2 font-sans">
                          Main
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{PACK_LABELS[b.pack_type]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(b.units_per_pack)}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="space-x-1 text-right whitespace-nowrap">
                        {!b.is_primary && b.pack_type === "unit" && (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            action={setPrimaryBarcode.bind(null, b.id, id)}
                          >
                            Make main
                          </ActionButton>
                        )}
                        <ActionButton
                          variant="ghost"
                          size="sm"
                          action={removeBarcode.bind(null, b.id, id)}
                          confirm={{
                            title: `Remove barcode ${b.barcode}?`,
                            description:
                              "Scanning it will no longer find this product.",
                            confirmLabel: "Remove",
                          }}
                        >
                          Remove
                        </ActionButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No barcodes yet.
              {product.till_code &&
                ` The till finds it by till code ${product.till_code}.`}
            </p>
          )}
          {canEdit && product.active && (
            <AddBarcodeForm action={addBarcode.bind(null, id)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>
            Who sells it to us, their code for it and the case size.
            {showCosts &&
              " Margins use the latest case cost and the selling price before VAT."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {links?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Their code</TableHead>
                  <TableHead className="text-right">Case of</TableHead>
                  {showCosts && (
                    <>
                      <TableHead className="text-right">Case cost</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const cost = costs.get(link.id);
                  const margin =
                    sellExVat != null && cost?.unit_cost != null
                      ? marginPercent(sellExVat, cost.unit_cost)
                      : null;
                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        {link.supplier ? (
                          <Link
                            href={`/suppliers/${link.supplier.id}`}
                            className="font-medium hover:underline"
                          >
                            {link.supplier.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {link.is_preferred && (
                          <Badge variant="secondary" className="ml-2">
                            Preferred
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {link.supplier_code ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(link.units_per_case, soldBy)}
                      </TableCell>
                      {showCosts && (
                        <>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(cost?.case_cost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatUnitCost(cost?.unit_cost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {margin == null ? "—" : `${margin.toFixed(1)}%`}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No supplier has this product yet. Add it from a supplier&apos;s
              page, or import their price list.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selling price history</CardTitle>
        </CardHeader>
        <CardContent>
          {prices?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((price, i) => {
                  const previous = prices[i + 1]?.sell_price;
                  const change =
                    previous && price.sell_price != null
                      ? ((price.sell_price - previous) / previous) * 100
                      : null;
                  return (
                    <TableRow key={price.id}>
                      <TableCell>
                        {formatDateTime(price.effective_from)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(price.sell_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(change)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {price.source === "spreadsheet"
                          ? "Spreadsheet import"
                          : "Changed by hand"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No selling price has been set.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
