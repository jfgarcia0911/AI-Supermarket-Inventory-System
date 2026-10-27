"use client";

import { useActionState, useState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { ProductSearch } from "@/components/product-search";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { formatQuantity } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";

import type { ProductMatch } from "../products/search";
import { requestAdjustment } from "./actions";

export interface ReasonOption {
  id: string;
  name: string;
  direction: "decrease" | "increase" | "either";
  noteRequired: boolean;
}

export function AdjustmentForm({
  reasons,
  initialProduct,
}: {
  reasons: ReasonOption[];
  initialProduct: ProductMatch | null;
}) {
  const [state, formAction] = useActionState(
    requestAdjustment,
    initialFormState,
  );
  const [product, setProduct] = useState<ProductMatch | null>(initialProduct);
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "");
  const reason = reasons.find((r) => r.id === reasonId);

  // After a successful save, start again with the next product.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok) setProduct(null);
  }

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      {product ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
          <div>
            <p className="font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              {[product.brand, product.size].filter(Boolean).join(" · ")}
              {" · "}
              {product.onHand == null
                ? "no stock recorded yet"
                : `${formatQuantity(product.onHand, product.soldBy)} in stock`}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setProduct(null)}
          >
            Change product
          </Button>
        </div>
      ) : (
        <ProductSearch onChoose={setProduct} />
      )}

      {product && (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="product_id" value={product.id} />
          <div className="flex flex-wrap items-start gap-3">
            <Field
              className="w-56"
              data-invalid={Boolean(state.fieldErrors.reason_id)}
            >
              <FieldLabel htmlFor="reason_id">Reason</FieldLabel>
              <NativeSelect
                id="reason_id"
                name="reason_id"
                value={reasonId}
                onChange={(event) => setReasonId(event.target.value)}
              >
                {reasons.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {reason?.direction === "either" && (
              <Field className="w-44">
                <FieldLabel htmlFor="direction">Which way?</FieldLabel>
                <NativeSelect
                  id="direction"
                  name="direction"
                  defaultValue="out"
                >
                  <NativeSelectOption value="out">
                    Take out of stock
                  </NativeSelectOption>
                  <NativeSelectOption value="in">
                    Add to stock
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            )}
            <Field
              className="w-36"
              data-invalid={Boolean(state.fieldErrors.quantity)}
            >
              <FieldLabel htmlFor="quantity">
                {product.soldBy === "kg" ? "How many kg" : "How many"}
              </FieldLabel>
              <Input
                id="quantity"
                name="quantity"
                inputMode="decimal"
                required
              />
              <FieldDescription>
                {reason?.direction === "increase"
                  ? "Added to stock."
                  : reason?.direction === "decrease"
                    ? "Taken out of stock."
                    : "Single items, not cases."}
              </FieldDescription>
            </Field>
          </div>
          <Field data-invalid={Boolean(state.fieldErrors.note)}>
            <FieldLabel htmlFor="note">
              Note{reason?.noteRequired ? " (needed for this reason)" : ""}
            </FieldLabel>
            <Input
              id="note"
              name="note"
              maxLength={500}
              required={reason?.noteRequired}
            />
          </Field>
          <FieldErrors state={state} name="quantity" />
          <SubmitButton pendingText="Recording…">Record</SubmitButton>
        </form>
      )}
    </div>
  );
}
