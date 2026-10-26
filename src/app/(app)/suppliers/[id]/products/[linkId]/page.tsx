import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
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
import { requireRole } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatUnitCost,
} from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { removeSupplierProduct, saveSupplierProduct } from "../../../actions";
import { SupplierProductForm } from "../../../supplier-product-form";

export const metadata: Metadata = { title: "Supplier product" };

const SOURCE_LABELS = {
  invoice: "Delivery",
  import: "Price list import",
  manual: "Entered by hand",
} as const;

export default function SupplierProductPage(
  props: PageProps<"/suppliers/[id]/products/[linkId]">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SupplierProduct params={props.params} />
    </Suspense>
  );
}

async function SupplierProduct({
  params,
}: {
  params: PageProps<"/suppliers/[id]/products/[linkId]">["params"];
}) {
  await requireRole("owner", "manager");
  const { id, linkId } = await params;
  if (!isUuid(id) || !isUuid(linkId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: link } = await supabase
    .from("supplier_products")
    .select(
      "id, supplier_code, supplier_description, units_per_case, is_preferred, active, supplier:suppliers(name), product_id",
    )
    .eq("id", linkId)
    .eq("supplier_id", id)
    .maybeSingle();
  if (!link || !link.active) {
    notFound();
  }

  const [{ data: product }, { data: history }] = await Promise.all([
    supabase
      .from("product_overview")
      .select("id, name, primary_barcode, till_code")
      .eq("id", link.product_id)
      .maybeSingle(),
    supabase
      .from("supplier_cost_history")
      .select("id, case_cost, unit_cost, change_pct, effective_date, source")
      .eq("supplier_product_id", linkId)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader
        title={product?.name ?? "Supplier product"}
        description={`From ${link.supplier?.name ?? "this supplier"}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Their code and case size</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierProductForm
            action={saveSupplierProduct.bind(null, id, linkId)}
            showCost
            cancelHref={`/suppliers/${id}`}
            link={{
              product_code:
                product?.primary_barcode ?? product?.till_code ?? "",
              supplier_code: link.supplier_code,
              supplier_description: link.supplier_description,
              units_per_case: link.units_per_case,
              is_preferred: link.is_preferred,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost history</CardTitle>
          <CardDescription>
            Case costs before VAT, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Case cost</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.effective_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.case_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUnitCost(row.unit_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.change_pct)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {SOURCE_LABELS[row.source]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No cost recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          variant="outline"
          action={removeSupplierProduct.bind(null, linkId, id)}
          confirm={{
            title: "Remove this product from the supplier?",
            description:
              "Deliveries from them will no longer match it by their code. Its cost history is kept.",
            confirmLabel: "Remove",
          }}
        >
          Remove from this supplier
        </ActionButton>
        <Link
          href={`/products/${link.product_id}`}
          className="text-sm hover:underline"
        >
          Open the product
        </Link>
      </div>
    </>
  );
}
