import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  FileUpIcon,
  PackageIcon,
  PackageOpenIcon,
  PoundSterlingIcon,
  Trash2Icon,
  TrendingDownIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { HeaderSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import {
  DOCUMENT_LABELS,
  isPostingOverdue,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/lib/deliveries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/imports/fields";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { describeMissingDays, type SalesCoverage } from "@/lib/sales";
import type { StockSummary } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const supabase = await createClient();
  const count = { count: "exact" as const, head: true };
  const canEdit = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);

  const [
    { data: summaryData },
    products,
    noPrice,
    categories,
    suppliers,
    { data: openDeliveries },
    { data: recentDeliveries },
    pendingAdjustments,
    { data: unpostedSetting },
    { data: coverageData },
  ] = await Promise.all([
    supabase.rpc("stock_summary"),
    supabase.from("products").select("id", count).eq("active", true),
    supabase
      .from("products")
      .select("id", count)
      .eq("active", true)
      .is("sell_price", null),
    supabase.from("categories").select("id", count).eq("active", true),
    supabase.from("suppliers").select("id", count).eq("active", true),
    supabase
      .from("supplier_invoices")
      .select("id, status, checked_in_at")
      .in("status", ["draft", "checked_in"]),
    supabase
      .from("delivery_overview")
      .select("id, supplier_name, document_type, status, delivered_at")
      .order("delivered_at", { ascending: false })
      .limit(5),
    supabase
      .from("stock_adjustments")
      .select("id", count)
      .eq("status", "pending"),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "unposted_delivery_hours")
      .maybeSingle(),
    user.role !== "staff"
      ? supabase.rpc("sales_coverage")
      : Promise.resolve({ data: null }),
  ]);
  const imports =
    user.role !== "staff"
      ? (
          await supabase
            .from("imports")
            .select("id, import_type, file_name, committed_at, rows_ok")
            .order("committed_at", { ascending: false })
            .limit(5)
        ).data
      : null;

  const summary = summaryData as unknown as StockSummary | null;
  const coverage = coverageData as unknown as SalesCoverage | null;
  const unpostedHours = Number(unpostedSetting?.value ?? 24);
  const drafts = (openDeliveries ?? []).filter((d) => d.status === "draft");
  const toPost = (openDeliveries ?? []).filter(
    (d) => d.status === "checked_in",
  );
  const overdue = toPost.filter((d) =>
    isPostingOverdue(d.checked_in_at, unpostedHours),
  );
  const toApprove = pendingAdjustments.count ?? 0;

  const tiles = [
    showCosts
      ? {
          label: "Stock value",
          value: formatMoney(summary?.stock_value ?? 0),
          href: "/stock",
          icon: PoundSterlingIcon,
        }
      : {
          label: "Products",
          value: (products.count ?? 0).toLocaleString("en-GB"),
          href: "/products",
          icon: PackageIcon,
        },
    {
      label: "Low stock",
      value: (summary?.low_stock ?? 0).toLocaleString("en-GB"),
      href: "/stock?show=low",
      icon: TrendingDownIcon,
    },
    {
      label: "Below zero",
      value: (summary?.negative_stock ?? 0).toLocaleString("en-GB"),
      href: "/stock?show=negative",
      icon: AlertTriangleIcon,
    },
    {
      label: canEdit ? "To approve" : "Waiting for approval",
      value: toApprove.toLocaleString("en-GB"),
      href: "/adjustments",
      icon: ClipboardCheckIcon,
    },
  ];

  // The jobs list: only the things that need someone to act.
  const jobs: { text: string; href: string; urgent?: boolean }[] = [];
  if (coverage?.missing_count) {
    jobs.push({
      text: `Sales not imported for ${describeMissingDays(coverage.missing_days, coverage.missing_count)}`,
      href: canEdit ? "/imports/new?kind=sales" : "/sales",
      urgent: true,
    });
  }
  if (canEdit && coverage?.unmatched_lines) {
    jobs.push({
      text: `${plural(coverage.unmatched_lines, "till line", "till lines")} to match to a product`,
      href: "/sales/unmatched",
    });
  }
  if (toPost.length) {
    jobs.push({
      text: canEdit
        ? `${plural(toPost.length, "delivery", "deliveries")} to check costs and post`
        : `${plural(toPost.length, "delivery", "deliveries")} waiting for a manager to post`,
      href: "/deliveries",
      urgent: overdue.length > 0,
    });
  }
  if (overdue.length) {
    jobs.push({
      text: `${plural(overdue.length, "delivery", "deliveries")} checked in more than ${unpostedHours} hours ago and still not posted`,
      href: "/deliveries",
      urgent: true,
    });
  }
  if (drafts.length) {
    jobs.push({
      text: `${plural(drafts.length, "delivery", "deliveries")} still being checked in`,
      href: "/deliveries",
    });
  }
  if (toApprove && canEdit) {
    jobs.push({
      text: `${plural(toApprove, "adjustment", "adjustments")} to approve`,
      href: "/adjustments",
      urgent: true,
    });
  }
  if (summary?.negative_stock) {
    jobs.push({
      text: `${plural(summary.negative_stock, "product", "products")} below zero: something was probably not recorded`,
      href: "/stock?show=negative",
    });
  }
  if (canEdit && summary?.never_counted) {
    jobs.push({
      text: `${plural(summary.never_counted, "product", "products")} with no opening stock yet`,
      href: "/stock?show=not_counted",
    });
  }
  if (canEdit && noPrice.count) {
    jobs.push({
      text: `${plural(noPrice.count, "product", "products")} missing a selling price`,
      href: "/products",
    });
  }

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        description="Today's stock at a glance."
      >
        {canEdit && (
          <Button
            variant="outline"
            render={<Link href="/imports/new?kind=sales" />}
          >
            <FileUpIcon />
            Import sales
          </Button>
        )}
        {user.role !== "viewer" && (
          <>
            <Button variant="outline" render={<Link href="/adjustments" />}>
              <Trash2Icon />
              Record waste
            </Button>
            <Button render={<Link href="/deliveries/new" />}>
              <PackageOpenIcon />
              Start a delivery
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <tile.icon className="size-4" />
                  {tile.label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {tile.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for you</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length ? (
              <ul className="divide-y text-sm">
                {jobs.map((job) => (
                  <li key={job.text}>
                    <Link
                      href={job.href}
                      className="flex items-start gap-2 py-2 hover:underline"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          job.urgent ? "bg-destructive" : "bg-muted-foreground"
                        }`}
                      />
                      {job.text}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-4" />
                Nothing waiting.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            {recentDeliveries?.length ? (
              <ul className="divide-y text-sm">
                {recentDeliveries.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deliveries/${d.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 hover:underline"
                    >
                      <span>
                        <span className="font-medium">{d.supplier_name}</span>
                        {d.document_type === "credit_note" && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {DOCUMENT_LABELS.credit_note}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {formatDateTime(d.delivered_at)}
                        </span>
                      </span>
                      {d.status && (
                        <Badge variant={STATUS_BADGE[d.status]}>
                          {STATUS_LABELS[d.status]}
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No deliveries yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            {[
              { label: "Products", value: products.count, href: "/products" },
              {
                label: "Categories",
                value: categories.count,
                href: "/categories",
              },
              {
                label: "Suppliers",
                value: suppliers.count,
                href: "/suppliers",
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-muted-foreground">
                  <Link href={item.href} className="hover:underline">
                    {item.label}
                  </Link>
                </dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {(item.value ?? 0).toLocaleString("en-GB")}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {imports && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            {imports.length ? (
              <ul className="divide-y text-sm">
                {imports.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap justify-between gap-2 py-2"
                  >
                    <span>
                      <span className="font-medium">
                        {IMPORT_KIND_LABELS[row.import_type as ImportKind] ??
                          row.import_type}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        · {row.file_name}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {row.rows_ok.toLocaleString("en-GB")} rows ·{" "}
                      {formatDateTime(row.committed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing imported yet.{" "}
                {canEdit && (
                  <Link href="/imports/new?kind=products" className="underline">
                    Import your product list
                  </Link>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}
