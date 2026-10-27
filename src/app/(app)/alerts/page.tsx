import { BellIcon, CircleCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth";
import {
  ALERT_TYPE_LABELS,
  type AlertType,
  compareAlerts,
  SEVERITY_BADGE,
  SEVERITY_LABELS,
} from "@/lib/alerts";
import { formatDateTime } from "@/lib/format";
import { canEditCatalogue } from "@/lib/roles";
import { paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { acknowledgeAlert, resolveAlert } from "./actions";

export const metadata: Metadata = { title: "Alerts" };

const SHOW_OPTIONS = {
  open: "Open",
  resolved: "Closed",
  all: "All",
} as const;

export default function AlertsPage(props: PageProps<"/alerts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Alerts searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Alerts({
  searchParams,
}: {
  searchParams: PageProps<"/alerts">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showParam = paramText(params.show) ?? "open";
  const show = (
    showParam in SHOW_OPTIONS ? showParam : "open"
  ) as keyof typeof SHOW_OPTIONS;
  const typeParam = paramText(params.type);
  const type =
    typeParam && typeParam in ALERT_TYPE_LABELS
      ? (typeParam as AlertType)
      : undefined;

  const supabase = await createClient();
  // Work the alerts out again, so this page shows the shop as it is now.
  await supabase.rpc("refresh_alerts");

  let query = supabase
    .from("alerts")
    .select(
      "id, type, severity, status, message, link, first_seen_at, last_seen_at, acknowledged_at, resolved_at, acknowledger:profiles!alerts_acknowledged_by_fkey(full_name)",
    )
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (show === "open") query = query.neq("status", "resolved");
  if (show === "resolved") query = query.eq("status", "resolved");
  if (type) query = query.eq("type", type);
  const { data } = await query;
  const alerts = [...(data ?? [])].sort(compareAlerts);

  // Low stock can mean many products: unless asked for, show them as one line.
  const groupLowStock = !type && show === "open";
  const lowStock = groupLowStock
    ? alerts.filter((a) => a.type === "low_stock")
    : [];
  const listed = groupLowStock
    ? alerts.filter((a) => a.type !== "low_stock")
    : alerts;
  const canAct = user.role !== "viewer";
  const canClose = canEditCatalogue(user.role);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Problems the system has spotted. They close by themselves once fixed; mark one as seen to say you are on it."
      />

      <Form action="/alerts" className="flex flex-wrap gap-2">
        <NativeSelect
          name="show"
          defaultValue={show}
          aria-label="Show"
          className="w-32"
        >
          {Object.entries(SHOW_OPTIONS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          name="type"
          defaultValue={type ?? ""}
          aria-label="Type"
          className="w-56"
        >
          <NativeSelectOption value="">Every kind</NativeSelectOption>
          {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (
            <NativeSelectOption key={t} value={t}>
              {ALERT_TYPE_LABELS[t]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>

      {listed.length || lowStock.length ? (
        <ul className="divide-y rounded-lg border">
          {listed.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SEVERITY_BADGE[alert.severity]}>
                    {SEVERITY_LABELS[alert.severity]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ALERT_TYPE_LABELS[alert.type]}
                  </span>
                  {alert.status === "acknowledged" && (
                    <Badge variant="outline">
                      Seen
                      {alert.acknowledger?.full_name &&
                        ` by ${alert.acknowledger.full_name}`}
                    </Badge>
                  )}
                  {alert.status === "resolved" && (
                    <Badge variant="secondary">Closed</Badge>
                  )}
                </div>
                <p className="text-sm">
                  {alert.link ? (
                    <Link href={alert.link} className="hover:underline">
                      {alert.message}
                    </Link>
                  ) : (
                    alert.message
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Since {formatDateTime(alert.first_seen_at)}
                  {alert.resolved_at &&
                    ` · closed ${formatDateTime(alert.resolved_at)}`}
                </p>
              </div>
              {alert.status !== "resolved" && (
                <div className="flex shrink-0 gap-1">
                  {canAct && alert.status === "open" && (
                    <ActionButton
                      size="sm"
                      variant="outline"
                      action={acknowledgeAlert.bind(null, alert.id)}
                    >
                      Seen
                    </ActionButton>
                  )}
                  {canClose && (
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      action={resolveAlert.bind(null, alert.id)}
                      confirm={{
                        title: "Close this alert?",
                        description:
                          "If the problem is still there, the alert opens again next time the system checks.",
                        confirmLabel: "Close alert",
                      }}
                    >
                      Close
                    </ActionButton>
                  )}
                </div>
              )}
            </li>
          ))}
          {lowStock.length > 0 && (
            <li className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="space-y-1">
                <Badge variant={SEVERITY_BADGE.info}>
                  {SEVERITY_LABELS.info}
                </Badge>
                <p className="text-sm">
                  {lowStock.length.toLocaleString("en-GB")}{" "}
                  {lowStock.length === 1 ? "product is" : "products are"} at or
                  below the reorder point.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/alerts?type=low_stock" />}
                >
                  See them
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  render={<Link href="/stock?show=low" />}
                >
                  Stock list
                </Button>
              </div>
            </li>
          )}
        </ul>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {show === "open" ? <CircleCheckIcon /> : <BellIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {show === "open" ? "Nothing needs attention" : "No alerts"}
            </EmptyTitle>
            <EmptyDescription>
              {show === "open"
                ? "The system checks again every time this page or the dashboard opens."
                : "Try a different filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
