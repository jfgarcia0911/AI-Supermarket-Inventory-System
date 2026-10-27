import { ArrowLeftRightIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { dateToLondonLocal } from "@/lib/london-time";
import { type AppRole, canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { MOVEMENT_LABELS, signedQuantity } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

import { setOpeningStock } from "../actions";
import { OpeningStockForm } from "./opening-stock-form";

/** Stock on hand, recent movements and the ways to change them. */
export async function StockCard({
  productId,
  soldBy,
  active,
  reorderPoint,
  role,
}: {
  productId: string;
  soldBy: "each" | "kg";
  active: boolean;
  reorderPoint: number | null;
  role: AppRole;
}) {
  const supabase = await createClient();
  const showCosts = canSeeCosts(role);
  const [{ data: level }, { data: movements }, { data: cost }] =
    await Promise.all([
      supabase
        .from("stock_levels")
        .select("quantity_on_hand, last_movement_at, last_counted_at")
        .eq("product_id", productId)
        .maybeSingle(),
      supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity, occurred_at, reason:adjustment_reasons(name)",
        )
        .eq("product_id", productId)
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
      showCosts
        ? supabase
            .from("stock_costs")
            .select("average_unit_cost, last_unit_cost")
            .eq("product_id", productId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const onHand = level?.quantity_on_hand ?? 0;
  const counted = Boolean(level?.last_counted_at);
  const isLow = counted && reorderPoint != null && onHand <= reorderPoint;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock</CardTitle>
        <CardDescription>
          {counted
            ? `Opening stock or last count: ${formatDate(level?.last_counted_at)}.`
            : "No opening stock yet, so this number only shows changes recorded so far."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">In stock (estimated)</dt>
            <dd
              className={`text-2xl font-semibold tabular-nums ${onHand < 0 ? "text-destructive" : ""}`}
            >
              {formatQuantity(onHand, soldBy)}
            </dd>
            {isLow && (
              <dd className="text-xs text-muted-foreground">
                At or below the reorder point
              </dd>
            )}
            {onHand < 0 && (
              <dd className="text-xs text-muted-foreground">
                Below zero: something was probably not recorded.
              </dd>
            )}
          </div>
          {showCosts && (
            <>
              <div>
                <dt className="text-muted-foreground">Average cost</dt>
                <dd className="font-medium tabular-nums">
                  {formatUnitCost(cost?.average_unit_cost)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stock value</dt>
                <dd className="font-medium tabular-nums">
                  {cost?.average_unit_cost != null
                    ? formatMoney(Math.max(onHand, 0) * cost.average_unit_cost)
                    : "—"}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-muted-foreground">Last change</dt>
            <dd className="font-medium">
              {formatDateTime(level?.last_movement_at)}
            </dd>
          </div>
        </dl>

        {movements?.length ? (
          <ul className="divide-y rounded-md border text-sm">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  {MOVEMENT_LABELS[m.movement_type]}
                  {m.reason?.name && ` · ${m.reason.name}`}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(m.occurred_at)}
                  </span>
                </span>
                <span
                  className={`tabular-nums ${m.quantity < 0 ? "text-destructive" : ""}`}
                >
                  {signedQuantity(m.quantity, soldBy)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {canEditCatalogue(role) && active && !counted && (
          <OpeningStockForm
            action={setOpeningStock.bind(null, productId)}
            now={dateToLondonLocal(new Date())}
            soldBy={soldBy}
          />
        )}

        <div className="flex flex-wrap gap-2">
          {role !== "viewer" && active && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/adjustments?product=${productId}`} />}
            >
              <Trash2Icon />
              Record waste or adjust
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/stock/movements?product=${productId}`} />}
          >
            <ArrowLeftRightIcon />
            All movements
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
