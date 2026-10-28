import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  FileUpIcon,
  PackageIcon,
  PackageOpenIcon,
  PoundSterlingIcon,
  ScanBarcodeIcon,
  StoreIcon,
  Trash2Icon,
  TrendingDownIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { type SalesDay, SalesChart } from "@/components/sales-chart";
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
import { londonGreeting, londonLongDate } from "@/lib/london-time";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import type { StockSummary } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const ALERTS_SHOWN = 5;

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
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

const TONES = {
  green: "bg-success-soft text-success-ink",
  amber: "bg-warning-soft text-warning-ink",
  red: "bg-danger-soft text-destructive",
  blue: "bg-info-soft text-info-ink",
  citrus: "bg-citrus-soft text-citrus-ink",
} as const;

function StatTile({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_28px_-14px_oklch(0.3_0.04_160/0.3)]">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {label}
            </span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                TONES[tone],
              )}
            >
              <Icon className="size-4" />
            </span>
          </div>
          <div className="font-display text-[2rem] leading-none font-semibold tracking-[-0.02em]">
            {value}
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const supabase = await createClient();
  const count = { count: "exact" as const, head: true };
  const canEdit = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);
  const isStaff = user.role === "staff";
  const now = new Date();

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
    { data: dailySales },
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
      .neq("status", "void")
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
    isStaff
      ? Promise.resolve({ data: null })
      : supabase.rpc("report_daily_sales", { p_days: 14 }),
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
  const urgentAlerts = otherAlerts.filter((a) => a.severity !== "info").length;

  const salesDays: SalesDay[] = (dailySales ?? []).map((d) => ({
    day: d.day,
    gross: Number(d.gross_sales),
    items: Number(d.items_sold),
    status: d.status as SalesDay["status"],
  }));
  const importedDays = salesDays.filter((d) => d.status === "imported");
  const salesTotal = importedDays.reduce((sum, d) => sum + d.gross, 0);

  const tiles = [
    showCosts
      ? {
          label: "Stock value",
          value: formatMoney(summary?.stock_value ?? 0),
          hint: "At average cost",
          href: "/reports/stock",
          icon: PoundSterlingIcon,
          tone: "green" as const,
        }
      : {
          label: "Products",
          value: (products.count ?? 0).toLocaleString("en-GB"),
          hint: "On sale in the shop",
          href: "/products",
          icon: PackageIcon,
          tone: "green" as const,
        },
    {
      label: "Low stock",
      value: (summary?.low_stock ?? 0).toLocaleString("en-GB"),
      hint: "At or below the reorder point",
      href: "/stock?show=low",
      icon: TrendingDownIcon,
      tone: "amber" as const,
    },
    {
      label: "Below zero",
      value: (summary?.negative_stock ?? 0).toLocaleString("en-GB"),
      hint: "Something was not recorded",
      href: "/stock?show=negative",
      icon: AlertTriangleIcon,
      tone: "red" as const,
    },
    {
      label: canEdit ? "To approve" : "Waiting for approval",
      value: (toApprove + toReview.length).toLocaleString("en-GB"),
      hint: "Adjustments and counts",
      href: toApprove || !toReview.length ? "/adjustments" : "/counts",
      icon: ClipboardCheckIcon,
      tone: "blue" as const,
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

  const needsYou = jobs.filter((j) => j.urgent).length + urgentAlerts;
  const tasks = [
    {
      label: "Scan a product",
      hint: "Stock, history, waste",
      href: "/scan",
      icon: ScanBarcodeIcon,
      tone: "green" as const,
    },
    {
      label: "Check in a delivery",
      hint: "Scan what arrived",
      href: "/deliveries/new",
      icon: PackageOpenIcon,
      tone: "citrus" as const,
    },
    {
      label: counting.length ? `Count: ${counting[0].name}` : "Counts",
      hint: counting.length ? "Counting is open" : "Nothing to count yet",
      href: counting.length ? `/counts/${counting[0].id}` : "/counts",
      icon: ClipboardCheckIcon,
      tone: "blue" as const,
    },
    {
      label: "Record waste",
      hint: "Damaged, expired, found",
      href: "/adjustments",
      icon: Trash2Icon,
      tone: "red" as const,
    },
  ];

  return (
    <>
      {/* The welcome banner: the day, a greeting and what needs doing. */}
      <section className="awning glass-rim relative overflow-hidden rounded-2xl px-6 py-7 text-banner-foreground shadow-[0_18px_40px_-24px_oklch(0.3_0.08_156/0.8)] [--glass-rim:oklch(1_0_0/0.35)] sm:px-8">
        <StoreIcon
          aria-hidden
          className="pointer-events-none absolute -right-6 -bottom-10 size-48 rotate-[-8deg] text-white/[0.07]"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-banner-foreground/70 uppercase">
              {londonLongDate(now)}
            </p>
            <h1 className="text-3xl leading-tight font-semibold tracking-[-0.02em] sm:text-[2.4rem]">
              {londonGreeting(now)}, {user.fullName.split(" ")[0]}
            </h1>
            <p className="max-w-md text-banner-foreground/80">
              {isStaff
                ? "What would you like to do?"
                : needsYou > 0
                  ? `${plural(needsYou, "thing needs", "things need")} your attention today.`
                  : "All quiet. Nothing needs you right now."}
            </p>
          </div>
          {!isStaff && (
            <div className="flex flex-wrap gap-2">
              {user.role !== "viewer" && (
                <Button
                  className="bg-citrus text-citrus-foreground shadow-sm hover:bg-citrus/90"
                  render={<Link href="/deliveries/new" />}
                >
                  <PackageOpenIcon />
                  Start a delivery
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  className="bg-white/12 text-banner-foreground ring-1 ring-white/25 backdrop-blur-md ring-inset hover:bg-white/20 hover:text-banner-foreground"
                  render={<Link href="/imports/new?kind=sales" />}
                >
                  <FileUpIcon />
                  Import sales
                </Button>
              )}
              {user.role !== "viewer" && (
                <Button
                  variant="ghost"
                  className="bg-white/12 text-banner-foreground ring-1 ring-white/25 backdrop-blur-md ring-inset hover:bg-white/20 hover:text-banner-foreground"
                  render={<Link href="/adjustments" />}
                >
                  <Trash2Icon />
                  Record waste
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {isStaff && (
        <div className="grid grid-cols-2 gap-3">
          {tasks.map((task) => (
            <Link key={task.label} href={task.href} className="group">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-active:translate-y-0">
                <CardContent className="flex flex-col gap-3">
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-xl",
                      TONES[task.tone],
                    )}
                  >
                    <task.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-display text-base leading-snug font-semibold">
                      {task.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {task.hint}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {!isStaff && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Till sales</CardTitle>
              <CardDescription>
                Last 14 days, including VAT
                {importedDays.length > 0 &&
                  ` · ${formatMoney(salesTotal)} over ${plural(importedDays.length, "day", "days")}`}
              </CardDescription>
              <CardAction>
                <Button
                  size="sm"
                  variant="ghost"
                  render={<Link href="/sales" />}
                >
                  Sales
                  <ArrowRightIcon />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <SalesChart days={salesDays} />
            </CardContent>
          </Card>
        )}

        <Card className={cn(isStaff && "lg:col-span-3")}>
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
              <ul className="space-y-1 text-sm">
                {otherAlerts.slice(0, ALERTS_SHOWN).map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alert.link ?? "/alerts"}
                      className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60"
                    >
                      <Badge
                        variant={SEVERITY_BADGE[alert.severity]}
                        className="mt-0.5 shrink-0"
                      >
                        {SEVERITY_LABELS[alert.severity]}
                      </Badge>
                      <span className="text-pretty">{alert.message}</span>
                    </Link>
                  </li>
                ))}
                {lowStockAlerts.length > 0 && (
                  <li>
                    <Link
                      href="/stock?show=low"
                      className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60"
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
              <AllClear text="All clear." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className={cn(!isStaff && "lg:col-span-2")}>
          <CardHeader>
            <CardTitle>Waiting for you</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length ? (
              <ul className="space-y-1 text-sm">
                {jobs.map((job) => (
                  <li key={job.text}>
                    <Link
                      href={job.href}
                      className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          job.urgent ? "bg-citrus" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="flex-1">{job.text}</span>
                      <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <AllClear text="Nothing waiting." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
            <CardAction>
              <Button
                size="sm"
                variant="ghost"
                render={<Link href="/deliveries" />}
              >
                All
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentDeliveries?.length ? (
              <ul className="space-y-1 text-sm">
                {recentDeliveries.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deliveries/${d.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {d.supplier_name}
                          {d.document_type === "credit_note" && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {DOCUMENT_LABELS.credit_note}
                            </span>
                          )}
                        </span>
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

      {!isStaff && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Catalogue</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                {[
                  {
                    label: "Products",
                    value: products.count,
                    href: "/products",
                  },
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
                    <dd className="font-display text-2xl font-semibold">
                      {(item.value ?? 0).toLocaleString("en-GB")}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {imports && (
            <Card className="lg:col-span-2">
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
                            {IMPORT_KIND_LABELS[
                              row.import_type as ImportKind
                            ] ?? row.import_type}
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
                      <Link
                        href="/imports/new?kind=products"
                        className="underline"
                      >
                        Import your product list
                      </Link>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function AllClear({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success-ink">
      <CheckCircle2Icon className="size-4" />
      {text}
    </p>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}
