import type { Metadata } from "next";
import { Suspense } from "react";

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
import { createClient } from "@/lib/supabase/server";

import { updateStore, updateThresholds } from "./actions";
import { StoreForm, ThresholdsForm } from "./settings-forms";
import { THRESHOLD_KEYS, THRESHOLD_LABELS } from "./thresholds";

export const metadata: Metadata = { title: "Settings" };

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
  const [{ data: store }, { data: settings }, { data: vatRates }] =
    await Promise.all([
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
      supabase
        .from("vat_rates")
        .select("code, name, rate_pct")
        .order("rate_pct"),
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
            These come into use with stock adjustments, counts and deliveries in
            the next phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThresholdsForm action={updateThresholds} settings={thresholds} />
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
