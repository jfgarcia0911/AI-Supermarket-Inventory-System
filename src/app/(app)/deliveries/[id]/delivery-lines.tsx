"use client";

import { Trash2Icon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { ActionButton } from "@/components/action-button";
import { FieldErrors, SubmitButton } from "@/components/form-bits";
import { ProductSearch } from "@/components/product-search";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  DISCREPANCY_LABELS,
  type Discrepancy,
  type DocumentType,
  quantityLabels,
} from "@/lib/deliveries";
import { formatQuantity } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";

import {
  addDeliveryLine,
  removeDeliveryLine,
  updateDeliveryLine,
} from "../actions";

export interface DeliveryLineView {
  id: string;
  lineNumber: number;
  kind: "stock" | "non_stock";
  name: string;
  detail: string;
  soldBy: "each" | "kg";
  supplierCode: string | null;
  unitsPerCase: number;
  casesInvoiced: number;
  casesReceived: number;
  unitsReceived: number;
  discrepancy: Discrepancy;
  note: string | null;
}

/** Scan or search for a product, then choose how many cases arrived. */
export function AddProducts({
  invoiceId,
  supplierId,
  documentType,
}: {
  invoiceId: string;
  supplierId: string;
  documentType: DocumentType;
}) {
  const [cases, setCases] = useState("1");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-28">
          <FieldLabel htmlFor="add-cases">
            {documentType === "invoice" ? "Cases" : "Cases back"}
          </FieldLabel>
          <Input
            id="add-cases"
            inputMode="decimal"
            value={cases}
            onChange={(event) => setCases(event.target.value)}
          />
        </Field>
        <p className="pb-2 text-xs text-muted-foreground">
          Each scan adds this many cases. Scanning a product again adds more.
        </p>
      </div>
      <ProductSearch
        supplierId={supplierId}
        disabled={pending}
        autoFocus
        onChoose={(match) => {
          const count = Number(cases.replace(",", "."));
          if (!(count > 0)) {
            toast.error("Enter how many cases, more than zero.");
            return;
          }
          startTransition(async () => {
            const result = await addDeliveryLine(
              invoiceId,
              match.id,
              count,
              match.unitsPerCase,
            );
            if (result.ok) {
              toast.success(`Added ${formatQuantity(count)} × ${match.name}`);
            } else {
              toast.error(result.message ?? "Could not add it.");
            }
          });
        }}
      />
    </div>
  );
}

/** One product line with its quantities, editable while the delivery is open. */
export function LineEditor({
  line,
  invoiceId,
  documentType,
}: {
  line: DeliveryLineView;
  invoiceId: string;
  documentType: DocumentType;
}) {
  const [state, formAction] = useActionState(
    updateDeliveryLine.bind(null, line.id, invoiceId),
    initialFormState,
  );
  const labels = quantityLabels(documentType);
  const value = (key: string, fallback: string | number | null) =>
    state.values?.[key] ?? (fallback == null ? "" : String(fallback));

  return (
    <li className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="text-muted-foreground">{line.lineNumber}.</span>{" "}
            {line.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              line.detail,
              line.supplierCode && `their code ${line.supplierCode}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <ActionButton
          variant="ghost"
          size="sm"
          aria-label={`Remove ${line.name}`}
          action={removeDeliveryLine.bind(null, line.id, invoiceId)}
          confirm={{
            title: `Remove ${line.name}?`,
            description:
              "It comes off this delivery. Nothing has been added to stock yet.",
            confirmLabel: "Remove",
          }}
        >
          <Trash2Icon />
        </ActionButton>
      </div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field
          className="w-28"
          data-invalid={Boolean(state.fieldErrors.cases_invoiced)}
        >
          <FieldLabel htmlFor={`inv-${line.id}`}>{labels.invoiced}</FieldLabel>
          <Input
            id={`inv-${line.id}`}
            name="cases_invoiced"
            inputMode="decimal"
            defaultValue={value("cases_invoiced", line.casesInvoiced)}
          />
        </Field>
        <Field
          className="w-28"
          data-invalid={Boolean(state.fieldErrors.cases_received)}
        >
          <FieldLabel htmlFor={`rec-${line.id}`}>{labels.received}</FieldLabel>
          <Input
            id={`rec-${line.id}`}
            name="cases_received"
            inputMode="decimal"
            defaultValue={value("cases_received", line.casesReceived)}
          />
        </Field>
        <Field
          className="w-28"
          data-invalid={Boolean(state.fieldErrors.units_per_case)}
        >
          <FieldLabel htmlFor={`upc-${line.id}`}>
            {line.soldBy === "kg" ? "Kg in a case" : "Units in a case"}
          </FieldLabel>
          <Input
            id={`upc-${line.id}`}
            name="units_per_case"
            inputMode="decimal"
            defaultValue={value("units_per_case", line.unitsPerCase)}
          />
        </Field>
        {documentType === "invoice" ? (
          <Field className="w-48">
            <FieldLabel htmlFor={`dis-${line.id}`}>Problem</FieldLabel>
            <NativeSelect
              id={`dis-${line.id}`}
              name="discrepancy"
              defaultValue={value("discrepancy", line.discrepancy)}
            >
              {Object.entries(DISCREPANCY_LABELS).map(([key, label]) => (
                <NativeSelectOption key={key} value={key}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="discrepancy" value="none" />
        )}
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor={`note-${line.id}`}>Note</FieldLabel>
          <Input
            id={`note-${line.id}`}
            name="note"
            maxLength={300}
            defaultValue={value("note", line.note)}
          />
        </Field>
        <SubmitButton variant="outline" pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          = {formatQuantity(line.unitsReceived, line.soldBy)}{" "}
          {line.soldBy === "kg" ? "" : "units"}
        </span>
        {line.discrepancy !== "none" && (
          <Badge variant="outline">
            {DISCREPANCY_LABELS[line.discrepancy]}
          </Badge>
        )}
        {state.message && (
          <span className={state.ok ? "" : "text-destructive"}>
            {state.message}
          </span>
        )}
      </div>
      <FieldErrors state={state} name="cases_invoiced" />
      <FieldErrors state={state} name="cases_received" />
      <FieldErrors state={state} name="units_per_case" />
    </li>
  );
}
