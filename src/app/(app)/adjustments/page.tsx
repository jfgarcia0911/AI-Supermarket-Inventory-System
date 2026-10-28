import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
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
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { isUuid, paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import type { ProductMatch } from "../products/search";
import { decideAdjustment } from "./actions";
import { AdjustmentForm } from "./adjustment-form";

export const metadata: Metadata = { title: "Waste and adjustments" };

const STATUS_LABELS = {
  auto_approved: "Recorded",
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const STATUS_BADGE = {
  auto_approved: "success",
  pending: "warning",
  approved: "success",
  rejected: "outline",
} as const;

const ADJUSTMENT_FIELDS =
  "id, quantity, note, status, requested_at, decided_at, store_id, product:products(id, name, sold_by), reason:adjustment_reasons(name), requester:profiles!stock_adjustments_requested_by_fkey(full_name)";

export default function AdjustmentsPage(props: PageProps<"/adjustments">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Adjustments searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Adjustments({
  searchParams,
}: {
  searchParams: PageProps<"/adjustments">["searchParams"];
}) {
  const user = await requireUser();
  const productParam = paramText((await searchParams).product);
  const supabase = await createClient();
  const canRecord = user.role !== "viewer";
  const isManager = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);

  const [{ data: reasons }, { data: pending }, { data: recent }] =
    await Promise.all([
      supabase
        .from("adjustment_reasons")
        .select("id, name, direction, note_required")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("stock_adjustments")
        .select(ADJUSTMENT_FIELDS)
        .eq("status", "pending")
        .order("requested_at"),
      supabase
        .from("stock_adjustments")
        .select(ADJUSTMENT_FIELDS)
        .neq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(50),
    ]);

  // Value at today's average cost, to help decide.
  const averages = new Map<string, number | null>();
  if (showCosts && pending?.length) {
    const { data } = await supabase
      .from("stock_costs")
      .select("product_id, average_unit_cost")
      .in(
        "product_id",
        pending.flatMap((a) => (a.product ? [a.product.id] : [])),
      );
    for (const row of data ?? [])
      averages.set(row.product_id, row.average_unit_cost);
  }

  let initialProduct: ProductMatch | null = null;
  if (canRecord && isUuid(productParam)) {
    const [{ data: product }, { data: level }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, brand, size, sold_by")
        .eq("id", productParam)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("stock_levels")
        .select("quantity_on_hand")
        .eq("product_id", productParam)
        .maybeSingle(),
    ]);
    if (product) {
      initialProduct = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        size: product.size,
        soldBy: product.sold_by,
        matchedBy: "name",
        unitsPerCase: null,
        onHand: level?.quantity_on_hand ?? null,
      };
    }
  }

  const quantityText = (quantity: number, soldBy: "each" | "kg" | undefined) =>
    `${quantity > 0 ? "+" : "−"}${formatQuantity(Math.abs(quantity), soldBy)}`;

  return (
    <>
      <PageHeader
        title="Waste and adjustments"
        description="Stock that goes or turns up other than through deliveries and sales: waste, damage, theft, found stock and corrections."
      />

      {canRecord && (
        <Card>
          <CardHeader>
            <CardTitle>Record waste or an adjustment</CardTitle>
            <CardDescription>
              {isManager
                ? "Your adjustments change stock straight away."
                : "Small adjustments change stock straight away. Bigger ones wait for a manager to approve them."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdjustmentForm
              reasons={(reasons ?? []).map((r) => ({
                id: r.id,
                name: r.name,
                direction: r.direction as "decrease" | "increase" | "either",
                noteRequired: r.note_required,
              }))}
              initialProduct={initialProduct}
            />
          </CardContent>
        </Card>
      )}

      {pending && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
            <CardDescription>
              Over the limits in Settings. Stock changes only when a manager
              approves.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  {showCosts && (
                    <TableHead className="hidden text-right sm:table-cell">
                      Value
                    </TableHead>
                  )}
                  <TableHead className="hidden md:table-cell">
                    Recorded
                  </TableHead>
                  {isManager && (
                    <TableHead className="text-right">Decide</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((a) => {
                  const average = a.product ? averages.get(a.product.id) : null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-64 whitespace-normal">
                        {a.product?.name}
                        <div className="text-xs text-muted-foreground">
                          {a.reason?.name}
                          {a.note && ` · ${a.note}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantityText(a.quantity, a.product?.sold_by)}
                      </TableCell>
                      {showCosts && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {average != null
                            ? formatMoney(Math.abs(a.quantity) * average)
                            : "—"}
                        </TableCell>
                      )}
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {a.requester?.full_name} ·{" "}
                        {formatDateTime(a.requested_at)}
                      </TableCell>
                      {isManager && (
                        <TableCell className="space-x-1 text-right whitespace-nowrap">
                          <ActionButton
                            size="sm"
                            action={decideAdjustment.bind(null, a.id, true)}
                          >
                            Approve
                          </ActionButton>
                          <ActionButton
                            size="sm"
                            variant="outline"
                            action={decideAdjustment.bind(null, a.id, false)}
                            confirm={{
                              title: "Reject this adjustment?",
                              description:
                                "Stock will not change. The person who recorded it can record it again if needed.",
                              confirmLabel: "Reject",
                            }}
                          >
                            Reject
                          </ActionButton>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
        </CardHeader>
        <CardContent>
          {recent?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Recorded
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-64 whitespace-normal">
                      {a.product && (
                        <Link
                          href={`/products/${a.product.id}`}
                          className="hover:underline"
                        >
                          {a.product.name}
                        </Link>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {a.reason?.name}
                        {a.note && ` · ${a.note}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantityText(a.quantity, a.product?.sold_by)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={STATUS_BADGE[a.status]}>
                        {STATUS_LABELS[a.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {a.requester?.full_name} ·{" "}
                      {formatDateTime(a.requested_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
