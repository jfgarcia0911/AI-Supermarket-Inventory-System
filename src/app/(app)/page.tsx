import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  FileUpIcon,
  PackageIcon,
  PackageOpenIcon,
  PoundSterlingIcon,
  ScanBarcodeIcon,
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
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compareAlerts, SEVERITY_BADGE, SEVERITY_LABELS } from "@/lib/alerts";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_LABELS, STATUS_BADGE, STATUS_LABELS } from "@/lib/deliveries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/imports/fields";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import type { StockSummary } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const ALERTS_SHOWN = 6;

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
  const isStaff = user.role === "staff";

  // Work the alerts out again, so the dashboard shows the shop as it is now.
  await supabase.rpc("refresh_alerts");

  const [
    { data: summaryData },
    products,
    noPrice,
    categories,
    suppliers,
    { data: openDeliveries },
    { data: recentDeliveries },
    pendingAdjustments,
    { data: alerts },
    { data: openCounts },
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
      .select("id, status")
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
      .from("alerts")
      .select("id, type, severity, message, link, last_seen_at")
      .neq("status", "resolved")
      .order("last_seen_at", { ascending: false })
      .limit(500),
    supabase
      .from("stock_counts")
      .select("id, name, status")
      .in("status", ["in_progress", "submitted"])
      .order("as_of", { ascending: false }),
  ]);
  const imports = !isStaff
    ? (
        await supabase
          .from("imports")
          .select("id, import_type, file_name, committed_at, rows_ok")
          .order("committed_at", { ascending: false })
          .limit(5)
      ).data
    : null;

  const summary = summaryData as unknown as StockSummary | null;
  const drafts = (openDeliveries ?? []).filter((d) => d.status === "draft");
  const toPost = (openDeliveries ?? []).filter(
    (d) => d.status === "checked_in",
  );
  const toApprove = pendingAdjustments.count ?? 0;
  const counting = (openCounts ?? []).filter((c) => c.status === "in_progress");
  const toReview = (openCounts ?? []).filter((c) => c.status === "submitted");
  const sortedAlerts = [...(alerts ?? [])].sort(compareAlerts);
  const lowStockAlerts = sortedAlerts.filter((a) => a.type === "low_stock");
  const otherAlerts = sortedAlerts.filter((a) => a.type !== "low_stock");

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
      value: (toApprove + toReview.length).toLocaleString("en-GB"),
      href: toApprove || !toReview.length ? "/adjustments" : "/counts",
      icon: ClipboardCheckIcon,
    },
  ];

  // Things someone needs to do. Problems are in the Alerts card instead.
  const jobs: { text: string; href: string; urgent?: boolean }[] = [];
  for (const c of toReview) {
    jobs.push({
      text: canEdit ? `${c.name}: count to review` : `${c.name}: counted`,
      href: `/counts/${c.id}`,
      urgent: canEdit,
    });
  }
  for (const c of counting) {
    jobs.push({
      text: `${c.name}: counting is open`,
      href: `/counts/${c.id}`,
    });
  }
  if (toPost.length) {
    jobs.push({
      text: canEdit
        ? `${plural(toPost.length, "delivery", "deliveries")} to check costs and post`
        : `${plural(toPost.length, "delivery", "deliveries")} waiting for a manager to post`,
      href: "/deliveries",
      urgent: canEdit,
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

  const tasks = [
    { label: "Scan a product", href: "/scan", icon: ScanBarcodeIcon },
    {
      label: "Check in a delivery",
      href: "/deliveries/new",
      icon: PackageOpenIcon,
    },
    {
      label: counting.length ? `Count: ${counting[0].name}` : "Counts",
      href: counting.length ? `/counts/${counting[0].id}` : "/counts",
      icon: ClipboardCheckIcon,
    },
    { label: "Record waste", href: "/adjustments", icon: Trash2Icon },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        description={
          isStaff ? "What would you like to do?" : "Today's stock at a glance."
        }
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
        {!isStaff && user.role !== "viewer" && (
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

      {isStaff && (
        <div className="grid grid-cols-2 gap-3">
          {tasks.map((task) => (
            <Button
              key={task.label}
              variant="outline"
              className="h-24 flex-col gap-2 text-base whitespace-normal"
              render={<Link href={task.href} />}
            >
              <task.icon className="size-6" />
              {task.label}
            </Button>
          ))}
        </div>
      )}

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
            <CardTitle>Alerts</CardTitle>
            <CardDescription>
              {sortedAlerts.length
                ? `${sortedAlerts.length.toLocaleString("en-GB")} open`
                : "Nothing needs attention."}
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                variant="ghost"
                render={<Link href="/alerts" />}
              >
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {sortedAlerts.length ? (
              <ul className="divide-y text-sm">
                {otherAlerts.slice(0, ALERTS_SHOWN).map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alert.link ?? "/alerts"}
                      className="flex items-start gap-2 py-2 hover:underline"
                    >
                      <Badge
                        variant={SEVERITY_BADGE[alert.severity]}
                        className="mt-0.5 shrink-0"
                      >
                        {SEVERITY_LABELS[alert.severity]}
                      </Badge>
                      {alert.message}
                    </Link>
                  </li>
                ))}
                {lowStockAlerts.length > 0 && (
                  <li>
                    <Link
                      href="/stock?show=low"
                      className="flex items-start gap-2 py-2 hover:underline"
                    >
                      <Badge
                        variant={SEVERITY_BADGE.info}
                        className="mt-0.5 shrink-0"
                      >
                        {SEVERITY_LABELS.info}
                      </Badge>
                      {plural(lowStockAlerts.length, "product", "products")} at
                      or below the reorder point
                    </Link>
                  </li>
                )}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-4" />
                All clear.
              </p>
            )}
          </CardContent>
        </Card>

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
      </div>

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
            <p className="text-sm text-muted-foreground">No deliveries yet.</p>
          )}
        </CardContent>
      </Card>

      {!isStaff && (
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
      )}

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
