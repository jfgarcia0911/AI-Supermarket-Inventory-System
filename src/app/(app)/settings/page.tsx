import type { Metadata } from "next";
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
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import {
  addReason,
  setReasonActive,
  updateStore,
  updateThresholds,
} from "./actions";
import { ReasonForm, StoreForm, ThresholdsForm } from "./settings-forms";
import { THRESHOLD_KEYS, THRESHOLD_LABELS } from "./thresholds";

export const metadata: Metadata = { title: "Settings" };

const DIRECTION_LABELS = {
  decrease: "Out",
  increase: "In",
  either: "Either way",
} as const;

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireRole("owner");
  const supabase = await createClient();
  const [
    { data: store },
    { data: settings },
    { data: vatRates },
    { data: reasons },
  ] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, trading_day_end")
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("key, value, description")
      .in("key", [...THRESHOLD_KEYS]),
    supabase.from("vat_rates").select("code, name, rate_pct").order("rate_pct"),
    supabase
      .from("adjustment_reasons")
      .select("id, name, direction, note_required, active")
      .order("sort_order")
      .order("name"),
  ]);

  const thresholds = THRESHOLD_KEYS.map((key) => {
    const row = settings?.find((s) => s.key === key);
    return {
      key,
      value: Number(row?.value ?? 0),
      label: THRESHOLD_LABELS[key],
      description: row?.description ?? "",
    };
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Shop details and the limits the system works to."
      />

      {store && (
        <Card>
          <CardHeader>
            <CardTitle>Shop</CardTitle>
          </CardHeader>
          <CardContent>
            <StoreForm
              action={updateStore.bind(null, store.id)}
              store={store}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
          <CardDescription>
            Staff adjustments over either approval limit wait for a manager. The
            dashboard flags deliveries left unposted longer than the delivery
            limit. The recount limits come in with stock counts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThresholdsForm action={updateThresholds} settings={thresholds} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waste and adjustment reasons</CardTitle>
          <CardDescription>
            The choices people see when they record waste or correct stock.
            Switching a reason off hides it from the list; past records keep it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead>Moves stock</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">In use</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reasons ?? []).map((reason) => (
                <TableRow key={reason.id}>
                  <TableCell className="font-medium">
                    {reason.name}
                    {!reason.active && (
                      <Badge variant="outline" className="ml-2">
                        Off
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {DIRECTION_LABELS[
                      reason.direction as keyof typeof DIRECTION_LABELS
                    ] ?? reason.direction}
                  </TableCell>
                  <TableCell>
                    {reason.note_required ? "Required" : "Optional"}
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      action={setReasonActive.bind(
                        null,
                        reason.id,
                        !reason.active,
                      )}
                    >
                      {reason.active ? "Switch off" : "Switch on"}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ReasonForm action={addReason} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VAT rates</CardTitle>
          <CardDescription>
            UK rates. Products use the code; margins are worked out before VAT.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vatRates ?? []).map((rate) => (
                <TableRow key={rate.code}>
                  <TableCell className="font-mono">{rate.code}</TableCell>
                  <TableCell>{rate.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rate.rate_pct}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
