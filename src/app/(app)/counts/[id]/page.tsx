import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { ProductMatch } from "@/app/(app)/products/search";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  COUNT_SCOPE_LABELS,
  COUNT_STATUS_BADGE,
  COUNT_STATUS_LABELS,
  type CountReadiness,
  type CountReviewRow,
} from "@/lib/counts";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "@/lib/format";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { describeMissingDays } from "@/lib/sales";
import { isUuid, paramText } from "@/lib/search-params";
import { signedQuantity } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

import { submitCount } from "../actions";
import { CountEntry } from "./count-entry";
import { CountLine } from "./count-lines";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Count" };

const LINES_SHOWN = 200;

export default function CountPage(props: PageProps<"/counts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Count params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** count_review can return more rows than one request allows. */
async function reviewRows(
  supabase: Client,
  countId: string,
): Promise<CountReviewRow[]> {
  const rows: CountReviewRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await supabase
      .rpc("count_review", { p_count_id: countId })
      .range(from, from + 999);
    if (!data) break;
    rows.push(...(data as CountReviewRow[]));
    if (data.length < 1000) break;
  }
  return rows;
}

async function Count({
  params,
  searchParams,
}: {
  params: PageProps<"/counts/[id]">["params"];
  searchParams: PageProps<"/counts/[id]">["searchParams"];
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const productParam = paramText(query.product);
  const showAll = paramText(query.all) === "1";

  const supabase = await createClient();
  const [
    { data: count },
    { data: lines, count: lineTotal },
    { data: recounts },
  ] = await Promise.all([
    supabase
      .from("stock_counts")
      .select(
        "id, name, scope, status, as_of, notes, submitted_at, approved_at, cancelled_at, category:categories(name), creator:profiles!stock_counts_created_by_fkey(full_name), submitter:profiles!stock_counts_submitted_by_fkey(full_name), approver:profiles!stock_counts_approved_by_fkey(full_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stock_count_lines")
      .select(
        "id, product_id, location, counted_qty, counted_at, product:products(name, size, sold_by), counter:profiles!stock_count_lines_counted_by_fkey(full_name)",
        { count: "exact" },
      )
      .eq("count_id", id)
      .order("counted_at", { ascending: false })
      .limit(LINES_SHOWN),
    supabase
      .from("stock_count_recounts")
      .select("product:products(id, name, size)")
      .eq("count_id", id),
  ]);
  if (!count) notFound();

  const canCount = user.role !== "viewer";
  const isManager = canEditCatalogue(user.role);
  const canReview = user.role !== "staff";
  const showCosts = canSeeCosts(user.role);
  const open = count.status === "in_progress";
  const reviewing =
    canReview && (count.status === "submitted" || count.status === "approved");

  let initialProduct: ProductMatch | null = null;
  if (open && canCount && isUuid(productParam)) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, brand, size, sold_by")
      .eq("id", productParam)
      .eq("active", true)
      .maybeSingle();
    if (product) {
      initialProduct = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        size: product.size,
        soldBy: product.sold_by,
        matchedBy: "barcode",
        unitsPerCase: null,
        onHand: null,
      };
    }
  }

  const [review, readiness] = reviewing
    ? await Promise.all([
        reviewRows(supabase, id),
        count.status === "submitted"
          ? supabase
              .rpc("count_readiness", { p_count_id: id })
              .then(({ data }) => data as unknown as CountReadiness | null)
          : Promise.resolve(null),
      ])
    : [[], null];

  const countedProducts = new Set((lines ?? []).map((l) => l.product_id)).size;
  const counted = review.filter((r) => r.counted_total != null);
  const uncounted = review.filter((r) => r.counted_total == null);
  const flagged = counted.filter((r) => r.flagged);
  const shown = showAll
    ? counted
    : counted.filter((r) => r.flagged || (r.variance_qty ?? 0) !== 0);
  const netValue = counted.reduce(
    (sum, r) => sum + (r.variance_qty ?? 0) * (r.unit_cost ?? 0),
    0,
  );

  const notYet =
    readiness && !readiness.happened
      ? `The count is for ${formatDateTime(count.as_of)}, which has not happened yet.`
      : null;
  const salesMissing =
    readiness && readiness.missing_sales_count > 0
      ? `Import the sales for ${describeMissingDays(readiness.missing_sales_days, readiness.missing_sales_count)} first: the count needs every sale up to ${formatDate(readiness.sales_needed_through)}.`
      : null;
  const blocked = notYet ?? salesMissing;
  const withDifference = counted.filter(
    (r) => (r.variance_qty ?? 0) !== 0,
  ).length;

  const statusNote = {
    in_progress: canCount
      ? "Scan each product and enter how many you count. Count each place (shelf, stockroom, chiller) separately. When everything is counted, finish the count."
      : "Staff are counting.",
    submitted: canReview
      ? `Counting finished${count.submitter?.full_name ? ` by ${count.submitter.full_name}` : ""} ${formatDateTime(count.submitted_at)}. Check the differences, then approve.`
      : "Counting is finished. A manager will review it.",
    approved: `Approved${count.approver?.full_name ? ` by ${count.approver.full_name}` : ""} ${formatDateTime(count.approved_at)}. Stock was corrected to the counted figures as of ${formatDateTime(count.as_of)}.`,
    cancelled: `Cancelled ${formatDateTime(count.cancelled_at)}. Stock did not change.`,
  }[count.status];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {count.name}
            <Badge variant={COUNT_STATUS_BADGE[count.status]}>
              {COUNT_STATUS_LABELS[count.status]}
            </Badge>
          </span>
        }
        description={[
          COUNT_SCOPE_LABELS[count.scope] +
            (count.category ? `: ${count.category.name}` : ""),
          `as of ${formatDateTime(count.as_of)}`,
          count.creator?.full_name && `started by ${count.creator.full_name}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <Alert>
        <AlertDescription>{statusNote}</AlertDescription>
      </Alert>
      {count.notes && (
        <p className="text-sm whitespace-pre-line">{count.notes}</p>
      )}

      {open && canCount && (
        <Card>
          <CardHeader>
            <CardTitle>Count</CardTitle>
            {recounts && recounts.length > 0 && (
              <CardDescription>
                Count these again:{" "}
                {recounts
                  .map((r) =>
                    [r.product?.name, r.product?.size]
                      .filter(Boolean)
                      .join(" "),
                  )
                  .join(", ")}
                .
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <CountEntry countId={id} initialProduct={initialProduct} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Counted so far</CardTitle>
          <CardDescription>
            {(lineTotal ?? 0).toLocaleString("en-GB")}{" "}
            {lineTotal === 1 ? "line" : "lines"}
            {(lineTotal ?? 0) <= LINES_SHOWN &&
              ` · ${countedProducts.toLocaleString("en-GB")} ${countedProducts === 1 ? "product" : "products"}`}
            {(lineTotal ?? 0) > LINES_SHOWN &&
              ` · showing the latest ${LINES_SHOWN}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines?.length ? (
            <ul className="divide-y rounded-md border">
              {lines.map((line) => (
                <CountLine
                  key={line.id}
                  countId={id}
                  editable={open && canCount}
                  line={{
                    id: line.id,
                    productName: line.product?.name ?? "Product",
                    productSize: line.product?.size ?? null,
                    soldBy: line.product?.sold_by ?? "each",
                    location: line.location,
                    quantity: line.counted_qty,
                    countedBy: line.counter?.full_name ?? null,
                    countedAt: formatDateTime(line.counted_at),
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing counted yet.
            </p>
          )}
          {open && canCount && (lineTotal ?? 0) > 0 && (
            <ActionButton
              action={submitCount.bind(null, id)}
              confirm={{
                title: "Finish counting?",
                description:
                  "The count goes to a manager to review. Nothing more can be added unless they ask for a recount.",
                confirmLabel: "Finish counting",
              }}
            >
              Finish counting
            </ActionButton>
          )}
        </CardContent>
      </Card>

      {reviewing && (
        <Card>
          <CardHeader>
            <CardTitle>Differences</CardTitle>
            <CardDescription>
              Counted against what the system expected at{" "}
              {formatDateTime(count.as_of)}.{" "}
              {counted.length.toLocaleString("en-GB")}{" "}
              {counted.length === 1 ? "product" : "products"} counted,{" "}
              {withDifference.toLocaleString("en-GB")} with a difference
              {showCosts && ` (net ${formatMoney(netValue)} at average cost)`}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {count.status === "submitted" && readiness && (
              <div className="space-y-2">
                {notYet && (
                  <Alert>
                    <TriangleAlertIcon />
                    <AlertTitle>Not yet</AlertTitle>
                    <AlertDescription>{notYet}</AlertDescription>
                  </Alert>
                )}
                {salesMissing && (
                  <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>Sales missing</AlertTitle>
                    <AlertDescription>{salesMissing}</AlertDescription>
                  </Alert>
                )}
                {readiness.missing_sales_count === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Sales imported up to{" "}
                    {formatDate(readiness.sales_needed_through)} ✓
                  </p>
                )}
                {readiness.unposted_deliveries > 0 && (
                  <Alert>
                    <TriangleAlertIcon />
                    <AlertTitle>
                      {readiness.unposted_deliveries}{" "}
                      {readiness.unposted_deliveries === 1
                        ? "delivery"
                        : "deliveries"}{" "}
                      not posted
                    </AlertTitle>
                    <AlertDescription>
                      Goods that arrived before the count but are not posted
                      will look like extra stock. Post them first if you can.{" "}
                      <Link href="/deliveries" className="underline">
                        Deliveries
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              <Link
                href={showAll ? `/counts/${id}` : `/counts/${id}?all=1`}
                className="underline"
              >
                {showAll
                  ? "Show differences only"
                  : "Show every counted product"}
              </Link>
            </div>

            {shown.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    {showCosts && (
                      <TableHead className="hidden text-right sm:table-cell">
                        Value
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.product_id}>
                      <TableCell className="max-w-64 whitespace-normal">
                        <Link
                          href={`/products/${r.product_id}`}
                          className="hover:underline"
                        >
                          {r.product_name}
                        </Link>
                        {r.product_size && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.product_size}
                          </span>
                        )}
                        {r.flagged && count.status === "submitted" && (
                          <span className="block text-xs text-destructive">
                            Over the recount limit: count again?
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(r.counted_total, r.sold_by)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(r.expected_qty, r.sold_by)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium tabular-nums ${(r.variance_qty ?? 0) < 0 ? "text-destructive" : ""}`}
                      >
                        {(r.variance_qty ?? 0) === 0
                          ? "0"
                          : signedQuantity(r.variance_qty ?? 0, r.sold_by)}
                      </TableCell>
                      {showCosts && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {r.unit_cost != null
                            ? formatMoney((r.variance_qty ?? 0) * r.unit_cost)
                            : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                Every counted product matches what was expected.
              </p>
            )}

            {uncounted.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Not counted: {uncounted.length.toLocaleString("en-GB")}{" "}
                  {uncounted.length === 1 ? "product" : "products"}
                </summary>
                <p className="mt-2 text-muted-foreground">
                  {uncounted
                    .slice(0, 60)
                    .map((r) =>
                      [r.product_name, r.product_size]
                        .filter(Boolean)
                        .join(" "),
                    )
                    .join(", ")}
                  {uncounted.length > 60 &&
                    ` and ${uncounted.length - 60} more`}
                </p>
              </details>
            )}

            {count.status === "submitted" && isManager && (
              <ReviewActions
                countId={id}
                flaggedIds={flagged.map((r) => r.product_id)}
                uncounted={uncounted.length}
                canSetUncountedToZero={
                  count.scope === "full" || count.scope === "category"
                }
                blocked={blocked}
              />
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/counts" className="hover:underline">
          Back to counts
        </Link>
      </p>
    </>
  );
}
