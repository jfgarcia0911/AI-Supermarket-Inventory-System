import { FileIcon, FileImageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { getVatRates } from "@/lib/catalogue";
import {
  DISCREPANCY_LABELS,
  DOCUMENT_LABELS,
  quantityLabels,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/lib/deliveries";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { dateToLondonLocal } from "@/lib/london-time";
import { canEditCatalogue, canSeeCosts } from "@/lib/roles";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import {
  addDeliveryCharge,
  checkInDelivery,
  saveDeliveryCosts,
  uploadDeliveryFile,
  voidDelivery,
} from "../actions";
import { type CostLine, CostsForm } from "./costs-form";
import { ChargeForm, FileUploadForm, VoidForm } from "./delivery-forms";
import {
  AddProducts,
  type DeliveryLineView,
  LineEditor,
} from "./delivery-lines";

export const metadata: Metadata = { title: "Delivery" };

export default function DeliveryPage(props: PageProps<"/deliveries/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Delivery params={props.params} />
    </Suspense>
  );
}

async function Delivery({
  params,
}: {
  params: PageProps<"/deliveries/[id]">["params"];
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: invoice }, { data: lineRows }, { data: files }] =
    await Promise.all([
      supabase
        .from("supplier_invoices")
        .select(
          "*, supplier:suppliers(id, name), checker:profiles!supplier_invoices_checked_in_by_fkey(full_name), poster:profiles!supplier_invoices_posted_by_fkey(full_name), voider:profiles!supplier_invoices_voided_by_fkey(full_name)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("supplier_invoice_lines")
        .select(
          "id, line_number, line_kind, supplier_product_id, printed_code, printed_description, units_per_case, cases_invoiced, cases_received, units_received, discrepancy, note, product:products(id, name, brand, size, sold_by, vat_code)",
        )
        .eq("invoice_id", id)
        .order("line_number"),
      supabase
        .from("supplier_invoice_files")
        .select(
          "id, storage_path, file_name, content_type, size_bytes, created_at",
        )
        .eq("invoice_id", id)
        .order("created_at"),
    ]);
  if (!invoice) {
    notFound();
  }

  const status = invoice.status;
  const isManager = canEditCatalogue(user.role);
  const showCosts = canSeeCosts(user.role);
  const open = status === "draft" || status === "checked_in";
  const canEditLines =
    open && (isManager || (user.role === "staff" && status === "draft"));
  const canEnterCosts = open && isManager;
  const labels = quantityLabels(invoice.document_type);
  const supplierName = invoice.supplier?.name ?? "Supplier";

  const lines: DeliveryLineView[] = (lineRows ?? []).map((l) => ({
    id: l.id,
    lineNumber: l.line_number,
    kind: l.line_kind,
    name: l.product?.name ?? l.printed_description ?? "Charge",
    detail: [l.product?.brand, l.product?.size].filter(Boolean).join(" · "),
    soldBy: l.product?.sold_by ?? "each",
    supplierCode: l.printed_code,
    unitsPerCase: l.units_per_case,
    casesInvoiced: l.cases_invoiced,
    casesReceived: l.cases_received,
    unitsReceived: l.units_received ?? 0,
    discrepancy: l.discrepancy,
    note: l.note,
  }));
  const stockLines = lines.filter((l) => l.kind === "stock");
  const unitsTotal = stockLines.reduce((sum, l) => sum + l.unitsReceived, 0);

  // Cost data, only for people allowed to see it.
  let totals: {
    net_total: number | null;
    vat_total: number | null;
    gross_total: number | null;
  } | null = null;
  const lineCosts = new Map<
    string,
    {
      case_cost: number | null;
      net_amount: number | null;
      vat_rate_pct: number;
    }
  >();
  const lastCosts = new Map<string, number | null>();
  const fileUrls = new Map<string, string>();
  let vatRates: Awaited<ReturnType<typeof getVatRates>> = [];
  let problems: string[] = [];
  if (showCosts) {
    const lineIds = lines.map((l) => l.id);
    const linkIds = (lineRows ?? []).flatMap((l) =>
      l.supplier_product_id ? [l.supplier_product_id] : [],
    );
    const [totalsResult, costsResult, latestResult, rates, signed] =
      await Promise.all([
        supabase
          .from("supplier_invoice_totals")
          .select("net_total, vat_total, gross_total")
          .eq("invoice_id", id)
          .maybeSingle(),
        lineIds.length
          ? supabase
              .from("supplier_invoice_line_costs")
              .select("line_id, case_cost, net_amount, vat_rate_pct")
              .in("line_id", lineIds)
          : Promise.resolve({ data: [] }),
        linkIds.length
          ? supabase
              .from("supplier_product_latest_costs")
              .select("supplier_product_id, case_cost")
              .in("supplier_product_id", linkIds)
          : Promise.resolve({ data: [] }),
        getVatRates(),
        files?.length
          ? supabase.storage.from("delivery-files").createSignedUrls(
              files.map((f) => f.storage_path),
              3600,
            )
          : Promise.resolve({ data: [] }),
      ]);
    totals = totalsResult.data;
    for (const c of costsResult.data ?? []) lineCosts.set(c.line_id, c);
    const latestByLink = new Map(
      (latestResult.data ?? []).map((c) => [
        c.supplier_product_id,
        c.case_cost,
      ]),
    );
    for (const l of lineRows ?? []) {
      lastCosts.set(
        l.id,
        l.supplier_product_id
          ? (latestByLink.get(l.supplier_product_id) ?? null)
          : null,
      );
    }
    for (const s of signed.data ?? []) {
      if (s.path && s.signedUrl) fileUrls.set(s.path, s.signedUrl);
    }
    vatRates = rates;
    if (canEnterCosts) {
      const { data } = await supabase.rpc("delivery_problems", {
        p_invoice_id: id,
      });
      problems = data ?? [];
    }
  }

  const vatFor = (code: string | undefined) =>
    vatRates.find((r) => r.code === code)?.rate_pct ?? 0;
  const costLines: CostLine[] = (lineRows ?? []).map((l) => {
    const saved = lineCosts.get(l.id);
    return {
      id: l.id,
      kind: l.line_kind,
      name: l.product?.name ?? l.printed_description ?? "Charge",
      soldBy: l.product?.sold_by ?? "each",
      casesInvoiced: l.cases_invoiced,
      unitsPerCase: l.units_per_case,
      caseCost:
        saved?.case_cost ??
        (l.line_kind === "stock" ? (lastCosts.get(l.id) ?? null) : null),
      netAmount: saved?.net_amount ?? null,
      vatRatePct:
        saved?.vat_rate_pct ??
        (l.line_kind === "stock" ? vatFor(l.product?.vat_code) : 20),
      lastCaseCost: lastCosts.get(l.id) ?? null,
    };
  });

  const statusNote = {
    draft:
      user.role === "staff"
        ? "Scan or search for each product, check the cases against what arrived, then finish the check-in."
        : "Being checked in. Products can still be added and changed.",
    checked_in: isManager
      ? "Checked in. Enter the costs from the paperwork, then post it to add the stock."
      : "Checked in. A manager will enter the costs and post it.",
    posted: `Posted ${formatDateTime(invoice.posted_at)}${invoice.poster?.full_name ? ` by ${invoice.poster.full_name}` : ""}. ${formatQuantity(unitsTotal)} units and kg ${invoice.document_type === "invoice" ? "added to" : "taken out of"} stock.`,
    void: `Voided ${formatDateTime(invoice.voided_at)}${invoice.voider?.full_name ? ` by ${invoice.voider.full_name}` : ""}: ${invoice.void_reason ?? ""}`,
  }[status];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {DOCUMENT_LABELS[invoice.document_type]}: {supplierName}
            <Badge variant={STATUS_BADGE[status]}>
              {STATUS_LABELS[status]}
            </Badge>
          </span>
        }
        description={[
          `${invoice.document_type === "invoice" ? "Arrived" : "Left"} ${formatDateTime(invoice.delivered_at)}`,
          invoice.invoice_number && `No. ${invoice.invoice_number}`,
          invoice.checker?.full_name &&
            `checked in by ${invoice.checker.full_name}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <Alert variant={status === "void" ? "destructive" : "default"}>
        <AlertDescription>{statusNote}</AlertDescription>
      </Alert>
      {invoice.notes && (
        <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            {stockLines.length} lines · {formatQuantity(unitsTotal)} units and
            kg
            {invoice.document_type === "credit_note" && " going back"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEditLines && invoice.supplier && (
            <AddProducts
              invoiceId={id}
              supplierId={invoice.supplier.id}
              documentType={invoice.document_type}
            />
          )}
          {stockLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : canEditLines ? (
            <ul className="divide-y rounded-lg border">
              {stockLines.map((line) => (
                <LineEditor
                  key={`${line.id}:${line.casesInvoiced}:${line.casesReceived}:${line.unitsPerCase}`}
                  line={line}
                  invoiceId={id}
                  documentType={invoice.document_type}
                />
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">
                    {labels.invoiced}
                  </TableHead>
                  <TableHead className="text-right">
                    {labels.received}
                  </TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  {showCosts && (
                    <TableHead className="hidden text-right sm:table-cell">
                      Case cost
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="max-w-64 whitespace-normal">
                      {line.name}
                      <div className="text-xs text-muted-foreground">
                        {[
                          line.supplierCode,
                          `case of ${formatQuantity(line.unitsPerCase, line.soldBy)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {line.discrepancy !== "none" &&
                          ` · ${DISCREPANCY_LABELS[line.discrepancy]}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.casesInvoiced)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.casesReceived)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.unitsReceived, line.soldBy)}
                    </TableCell>
                    {showCosts && (
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {formatMoney(lineCosts.get(line.id)?.case_cost)}
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            const cost = lineCosts.get(line.id)?.case_cost;
                            return cost != null
                              ? `${formatUnitCost(cost / line.unitsPerCase)} each`
                              : "";
                          })()}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {status === "draft" &&
            user.role !== "viewer" &&
            stockLines.length > 0 && (
              <ActionButton
                action={checkInDelivery.bind(null, id)}
                confirm={{
                  title: "Finish the check-in?",
                  description: isManager
                    ? "You can still change it until it is posted."
                    : "After this, only a manager can change it.",
                  confirmLabel: "Finish check-in",
                }}
              >
                Finish check-in
              </ActionButton>
            )}
        </CardContent>
      </Card>

      {canEnterCosts && (
        <Card>
          <CardHeader>
            <CardTitle>
              {invoice.document_type === "invoice"
                ? "Invoice and costs"
                : "Credit note"}
            </CardTitle>
            <CardDescription>
              Copy the numbers from the paperwork. Costs are before VAT. Case
              costs start at the supplier&apos;s last price; change any that
              differ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <CostsForm
              key={lines.map((l) => `${l.id}:${l.casesInvoiced}`).join(",")}
              action={saveDeliveryCosts.bind(null, id)}
              documentType={invoice.document_type}
              invoice={{
                number: invoice.invoice_number,
                date:
                  invoice.invoice_date ??
                  dateToLondonLocal(new Date(invoice.delivered_at)).slice(
                    0,
                    10,
                  ),
                netTotal: totals?.net_total ?? null,
                vatTotal: totals?.vat_total ?? null,
                grossTotal: totals?.gross_total ?? null,
              }}
              lines={costLines}
              vatRates={vatRates}
              problems={problems}
            />
            {invoice.document_type === "invoice" && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium">
                  Other charges on the invoice
                </h3>
                <ChargeForm
                  action={addDeliveryCharge.bind(null, id)}
                  vatRates={vatRates}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showCosts && !canEnterCosts && totals && (
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium">
                  {formatDate(invoice.invoice_date)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Before VAT</dt>
                <dd className="font-medium">{formatMoney(totals.net_total)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">VAT</dt>
                <dd className="font-medium">{formatMoney(totals.vat_total)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-medium">
                  {formatMoney(totals.gross_total)}
                </dd>
              </div>
            </dl>
            {lines.some((l) => l.kind === "non_stock") && (
              <ul className="mt-4 text-sm text-muted-foreground">
                {lines
                  .filter((l) => l.kind === "non_stock")
                  .map((l) => (
                    <li key={l.id}>
                      {l.name}: {formatMoney(lineCosts.get(l.id)?.net_amount)}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paperwork</CardTitle>
          <CardDescription>
            Photos or PDFs of the invoice or delivery note.
            {!showCosts &&
              " Only managers can open them, because they show prices."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {files?.length ? (
            <ul className="space-y-1 text-sm">
              {files.map((file) => {
                const url = fileUrls.get(file.storage_path);
                const Icon = file.content_type.startsWith("image/")
                  ? FileImageIcon
                  : FileIcon;
                return (
                  <li key={file.id} className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {file.file_name}
                      </a>
                    ) : (
                      <span>{file.file_name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {Math.max(1, Math.round(file.size_bytes / 1024))} KB ·{" "}
                      {formatDateTime(file.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          )}
          {status !== "void" && user.role !== "viewer" && (
            <FileUploadForm action={uploadDeliveryFile.bind(null, id)} />
          )}
        </CardContent>
      </Card>

      {user.role === "owner" && status !== "void" && (
        <Card>
          <CardHeader>
            <CardTitle>Void</CardTitle>
            <CardDescription>
              {status === "posted"
                ? "For a delivery entered by mistake. The stock it added is taken back out and its costs are removed. This cannot be undone."
                : "Cancels this delivery. Nothing has been added to stock yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoidForm action={voidDelivery.bind(null, id)} />
          </CardContent>
        </Card>
      )}

      <p className="text-sm">
        <Link
          href="/deliveries"
          className="text-muted-foreground hover:underline"
        >
          Back to deliveries
        </Link>
        {status === "posted" && (
          <>
            {" · "}
            <Link
              href="/stock/movements"
              className="text-muted-foreground hover:underline"
            >
              Stock movements
            </Link>
          </>
        )}
      </p>
    </>
  );
}
