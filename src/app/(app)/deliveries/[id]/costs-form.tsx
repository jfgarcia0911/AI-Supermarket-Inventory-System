"use client";

import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { FieldErrors, SubmitButton } from "@/components/form-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DocumentType } from "@/lib/deliveries";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitCost,
} from "@/lib/format";
import { type FormState, initialFormState } from "@/lib/form-state";

export interface CostLine {
  id: string;
  kind: "stock" | "non_stock";
  name: string;
  soldBy: "each" | "kg";
  casesInvoiced: number;
  unitsPerCase: number;
  /** Saved case cost, or the supplier's latest as a starting point. */
  caseCost: number | null;
  netAmount: number | null;
  vatRatePct: number;
  lastCaseCost: number | null;
}

const toNumber = (text: string) => {
  const value = Number(text.replace(/[£,\s]/g, ""));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const asText = (value: number | null) => (value == null ? "" : String(value));

export function CostsForm({
  action,
  documentType,
  invoice,
  lines,
  vatRates,
  problems,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  documentType: DocumentType;
  invoice: {
    number: string | null;
    date: string;
    netTotal: number | null;
    vatTotal: number | null;
    grossTotal: number | null;
  };
  lines: CostLine[];
  vatRates: { code: string; name: string; rate_pct: number }[];
  problems: string[];
}) {
  // The message is shown as soon as the server answers, not from an effect:
  // posting removes this form, so an effect would never run.
  const [state, formAction] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.message) {
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      }
      return result;
    },
    initialFormState,
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        asText(l.kind === "stock" ? l.caseCost : l.netAmount),
      ]),
    ),
  );
  const [vats, setVats] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, String(l.vatRatePct)])),
  );
  const [totals, setTotals] = useState({
    net: asText(invoice.netTotal),
    vat: asText(invoice.vatTotal),
    gross: asText(invoice.grossTotal),
  });

  const word = documentType === "invoice" ? "invoice" : "credit note";
  const lineNet = (line: CostLine) => {
    const amount = toNumber(amounts[line.id] ?? "");
    if (amount == null) return null;
    return round2(line.kind === "stock" ? amount * line.casesInvoiced : amount);
  };
  const linesNet = round2(lines.reduce((sum, l) => sum + (lineNet(l) ?? 0), 0));
  const linesVat = round2(
    lines.reduce(
      (sum, l) => sum + ((lineNet(l) ?? 0) * Number(vats[l.id] ?? 0)) / 100,
      0,
    ),
  );
  const enteredNet = toNumber(totals.net);
  const netMatches =
    enteredNet != null && Math.abs(enteredNet - linesNet) <= 0.02;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field data-invalid={Boolean(state.fieldErrors.invoice_number)}>
          <FieldLabel htmlFor="invoice_number">
            {documentType === "invoice"
              ? "Invoice number"
              : "Credit note number"}
          </FieldLabel>
          <Input
            id="invoice_number"
            name="invoice_number"
            maxLength={40}
            defaultValue={state.values?.invoice_number ?? invoice.number ?? ""}
          />
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors.invoice_date)}>
          <FieldLabel htmlFor="invoice_date">Date on the {word}</FieldLabel>
          <Input
            id="invoice_date"
            name="invoice_date"
            type="date"
            defaultValue={state.values?.invoice_date ?? invoice.date}
          />
        </Field>
        {(
          [
            ["net", "net_total", "Total before VAT"],
            ["vat", "vat_total", "VAT"],
            ["gross", "gross_total", "Total"],
          ] as const
        ).map(([key, name, label]) => (
          <Field key={name} data-invalid={Boolean(state.fieldErrors[name])}>
            <FieldLabel htmlFor={name}>{label} (£)</FieldLabel>
            <Input
              id={name}
              name={name}
              inputMode="decimal"
              value={totals[key]}
              onChange={(event) =>
                setTotals((t) => ({ ...t, [key]: event.target.value }))
              }
            />
          </Field>
        ))}
      </div>
      <FieldErrors state={state} name="invoice_date" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line</TableHead>
            <TableHead className="text-right">Cases</TableHead>
            <TableHead className="w-32">Case cost £</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Unit cost
            </TableHead>
            <TableHead className="hidden text-right md:table-cell">
              vs last
            </TableHead>
            <TableHead className="w-28">VAT</TableHead>
            <TableHead className="text-right">Line total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const amount = toNumber(amounts[line.id] ?? "");
            const change =
              line.kind === "stock" && amount != null && line.lastCaseCost
                ? ((amount - line.lastCaseCost) / line.lastCaseCost) * 100
                : null;
            return (
              <TableRow key={line.id}>
                <TableCell className="max-w-56 whitespace-normal">
                  {line.name}
                  {line.kind === "stock" && (
                    <div className="text-xs text-muted-foreground">
                      case of {formatQuantity(line.unitsPerCase, line.soldBy)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.kind === "stock"
                    ? formatQuantity(line.casesInvoiced)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Input
                    name={`${line.kind === "stock" ? "case_cost" : "amount"}:${line.id}`}
                    aria-label={`${line.kind === "stock" ? "Case cost" : "Amount"} for ${line.name}`}
                    inputMode="decimal"
                    value={amounts[line.id] ?? ""}
                    onChange={(event) =>
                      setAmounts((a) => ({
                        ...a,
                        [line.id]: event.target.value,
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {line.kind === "stock" && amount != null
                    ? formatUnitCost(amount / line.unitsPerCase)
                    : "—"}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  <span
                    className={
                      change && change > 0 ? "text-destructive" : undefined
                    }
                  >
                    {formatPercent(change)}
                  </span>
                </TableCell>
                <TableCell>
                  <NativeSelect
                    name={`vat:${line.id}`}
                    aria-label={`VAT for ${line.name}`}
                    size="sm"
                    value={vats[line.id]}
                    onChange={(event) =>
                      setVats((v) => ({ ...v, [line.id]: event.target.value }))
                    }
                  >
                    {vatRates.map((rate) => (
                      <NativeSelectOption
                        key={rate.code}
                        value={String(rate.rate_pct)}
                      >
                        {rate.rate_pct}%
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(lineNet(line))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {netMatches ? (
          <CircleCheckIcon className="size-4 text-emerald-600" />
        ) : (
          <CircleAlertIcon className="size-4 text-muted-foreground" />
        )}
        <span>
          The lines add up to <strong>{formatMoney(linesNet)}</strong> before
          VAT, plus about {formatMoney(linesVat)} VAT.
          {enteredNet != null &&
            !netMatches &&
            ` The ${word} says ${formatMoney(enteredNet)} before VAT.`}
        </span>
      </div>

      {problems.length > 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>Still needed before posting</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="intent"
          value="save"
          variant="outline"
          pendingText="Saving…"
        >
          Save
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…">
          Save and post
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Posting adds the stock (dated when it arrived), records each case cost
        and locks the {word}.
      </p>
    </form>
  );
}
