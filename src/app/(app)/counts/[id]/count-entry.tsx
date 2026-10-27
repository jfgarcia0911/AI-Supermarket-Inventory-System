"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProductMatch } from "@/app/(app)/products/search";
import { ProductSearch } from "@/components/product-search";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { COUNT_LOCATIONS } from "@/lib/counts";
import { formatQuantity } from "@/lib/format";

import { addCountLine } from "../actions";

/**
 * Scan (or find) a product, type how many, press Enter. The place is kept
 * between products, since people count one place at a time.
 */
export function CountEntry({
  countId,
  initialProduct,
}: {
  countId: string;
  initialProduct: ProductMatch | null;
}) {
  const [product, setProduct] = useState<ProductMatch | null>(initialProduct);
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState<string>(COUNT_LOCATIONS[0]);
  const [pending, startTransition] = useTransition();
  const quantityRef = useRef<HTMLInputElement>(null);

  const inCases =
    product?.matchedBy === "case_barcode" && (product.unitsPerCase ?? 0) > 0;
  const typed = Number(quantity.replace(",", "."));
  const units = inCases ? typed * (product?.unitsPerCase ?? 1) : typed;

  const save = () => {
    if (!product) return;
    if (quantity.trim() === "" || !Number.isFinite(typed) || typed < 0) {
      toast.error("Enter how many you counted (0 or more).");
      return;
    }
    startTransition(async () => {
      const result = await addCountLine(countId, product.id, units, location);
      if (result.ok) {
        toast.success(`${product.name}: ${result.message}`);
        setProduct(null);
        setQuantity("");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <Field className="max-w-48">
        <FieldLabel htmlFor="count-location">Counting in</FieldLabel>
        <NativeSelect
          id="count-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        >
          {COUNT_LOCATIONS.map((place) => (
            <NativeSelectOption key={place} value={place}>
              {place}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {product ? (
        <form
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="font-medium">
            {product.name}
            <span className="font-normal text-muted-foreground">
              {[product.brand, product.size].filter(Boolean).length > 0 &&
                ` · ${[product.brand, product.size].filter(Boolean).join(" · ")}`}
            </span>
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-40">
              <FieldLabel htmlFor="count-quantity">
                {inCases
                  ? `Cases of ${formatQuantity(product.unitsPerCase)}`
                  : product.soldBy === "kg"
                    ? "How many kg"
                    : "How many"}
              </FieldLabel>
              <Input
                id="count-quantity"
                ref={quantityRef}
                inputMode="decimal"
                autoFocus
                autoComplete="off"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setProduct(null);
                setQuantity("");
              }}
            >
              Cancel
            </Button>
          </div>
          {inCases && quantity !== "" && Number.isFinite(units) && (
            <FieldDescription>
              = {formatQuantity(units, product.soldBy)} single items
            </FieldDescription>
          )}
        </form>
      ) : (
        <ProductSearch onChoose={setProduct} autoFocus />
      )}
    </div>
  );
}
