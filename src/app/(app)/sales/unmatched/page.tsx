import { CircleCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { isValidGtin } from "@/lib/barcodes";
import { formatMoney, formatQuantity } from "@/lib/format";
import { canEditCatalogue } from "@/lib/roles";
import { describePeriod } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";

import { forgetSalesCodeRule } from "../actions";
import { UnmatchedCodeActions } from "./unmatched-code";

export const metadata: Metadata = { title: "Unmatched sales" };

export default function UnmatchedSalesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UnmatchedSales />
    </Suspense>
  );
}

async function UnmatchedSales() {
  const user = await requireRole("owner", "manager", "viewer");
  const canEdit = canEditCatalogue(user.role);

  const supabase = await createClient();
  const [{ data: codes }, { data: rules }] = await Promise.all([
    supabase
      .from("sales_unmatched_codes")
      .select("*")
      .order("line_count", { ascending: false })
      .order("code")
      .limit(200),
    supabase
      .from("sales_code_rules")
      .select("id, code, description, product:products(id, name, size)")
      .order("code"),
  ]);

  return (
    <>
      <PageHeader
        title="Unmatched sales"
        description="Till lines whose code no product has. They haven't come off stock yet. Match each code to a product, or ignore it if you don't keep stock of it."
      />

      {codes?.length ? (
        <div className="space-y-3">
          {codes.map((row) => {
            const code = row.code ?? "";
            const lineCount = row.line_count ?? 0;
            return (
              <Card key={code} size="sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-baseline gap-x-3">
                    {row.description ?? "No description"}
                    <span className="font-mono text-sm font-normal text-muted-foreground">
                      {code}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {lineCount.toLocaleString("en-GB")}{" "}
                    {lineCount === 1 ? "line" : "lines"} ·{" "}
                    {formatQuantity(row.quantity)} sold ·{" "}
                    {formatMoney(row.gross_value)} ·{" "}
                    {describePeriod(row.first_sale_date, row.last_sale_date)}
                  </CardDescription>
                </CardHeader>
                {canEdit && (
                  <CardContent>
                    <UnmatchedCodeActions
                      code={code}
                      lineCount={lineCount}
                      isBarcode={isValidGtin(code)}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Everything is matched</EmptyTitle>
            <EmptyDescription>
              Every till line imported so far belongs to a product or has been
              ignored.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {rules && rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Codes handled automatically</CardTitle>
            <CardDescription>
              Future imports match or ignore these codes without asking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>What happens</TableHead>
                  {canEdit && <TableHead className="text-right" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <span className="font-mono">{rule.code}</span>
                      {rule.description && (
                        <div className="text-xs text-muted-foreground">
                          {rule.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {rule.product ? (
                        <>
                          Matched to{" "}
                          <Link
                            href={`/products/${rule.product.id}`}
                            className="underline"
                          >
                            {[rule.product.name, rule.product.size]
                              .filter(Boolean)
                              .join(" · ")}
                          </Link>
                        </>
                      ) : (
                        "Ignored"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          action={forgetSalesCodeRule.bind(null, rule.code)}
                          confirm={{
                            title: `Stop handling ${rule.code} automatically?`,
                            description:
                              "Lines already matched or ignored stay as they are. If the code turns up in a future import, it will be listed here as unmatched.",
                            confirmLabel: "Stop",
                          }}
                        >
                          Stop
                        </ActionButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/sales" className="hover:underline">
          Back to sales
        </Link>
      </p>
    </>
  );
}
