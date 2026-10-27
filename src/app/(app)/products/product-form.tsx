"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldErrors, FormMessage, SubmitButton } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { type FormState, initialFormState } from "@/lib/form-state";

export interface ProductFormValues {
  name: string;
  brand: string | null;
  size: string | null;
  category_id: string;
  sold_by: "each" | "kg";
  vat_code: string;
  sell_price: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  till_code: string | null;
}

export function ProductForm({
  action,
  categories,
  vatRates,
  product,
  cancelHref,
  initialBarcode,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: { id: string; path: string }[];
  vatRates: { code: string; name: string; rate_pct: number }[];
  product?: ProductFormValues;
  cancelHref: string;
  /** For a new product found by scanning an unknown barcode. */
  initialBarcode?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const isNew = !product;

  // After a failed submit, show what the user typed rather than the saved values.
  const value = (key: keyof ProductFormValues | "barcode") =>
    state.values?.[key] ??
    (product
      ? String(product[key as keyof ProductFormValues] ?? "")
      : key === "barcode"
        ? (initialBarcode ?? "")
        : "");

  const field = (name: string) => ({
    "data-invalid": Boolean(state.fieldErrors[name]),
  });

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormMessage state={state} />
      <FieldGroup>
        <Field {...field("name")}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={value("name")}
          />
          <FieldErrors state={state} name="name" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...field("brand")}>
            <FieldLabel htmlFor="brand">Brand</FieldLabel>
            <Input
              id="brand"
              name="brand"
              maxLength={80}
              defaultValue={value("brand")}
            />
            <FieldErrors state={state} name="brand" />
          </Field>
          <Field {...field("size")}>
            <FieldLabel htmlFor="size">Size</FieldLabel>
            <Input
              id="size"
              name="size"
              maxLength={40}
              placeholder="e.g. 2L, 400g, 6 pack"
              defaultValue={value("size")}
            />
            <FieldErrors state={state} name="size" />
          </Field>
        </div>

        <Field {...field("category_id")}>
          <FieldLabel htmlFor="category_id">Category</FieldLabel>
          <NativeSelect
            id="category_id"
            name="category_id"
            required
            defaultValue={value("category_id")}
          >
            <NativeSelectOption value="">Choose a category…</NativeSelectOption>
            {categories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.path}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {categories.length === 0 && (
            <FieldDescription>
              There are no categories yet.{" "}
              <Link href="/categories" className="underline">
                Add one first
              </Link>
              .
            </FieldDescription>
          )}
          <FieldErrors state={state} name="category_id" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...field("sold_by")}>
            <FieldLabel htmlFor="sold_by">Sold by</FieldLabel>
            <NativeSelect
              id="sold_by"
              name="sold_by"
              defaultValue={value("sold_by") || "each"}
            >
              <NativeSelectOption value="each">
                Each (single items)
              </NativeSelectOption>
              <NativeSelectOption value="kg">Weight (kg)</NativeSelectOption>
            </NativeSelect>
            <FieldErrors state={state} name="sold_by" />
          </Field>
          <Field {...field("vat_code")}>
            <FieldLabel htmlFor="vat_code">VAT</FieldLabel>
            <NativeSelect
              id="vat_code"
              name="vat_code"
              required
              defaultValue={value("vat_code")}
            >
              <NativeSelectOption value="">Choose a rate…</NativeSelectOption>
              {vatRates.map((rate) => (
                <NativeSelectOption key={rate.code} value={rate.code}>
                  {rate.name} ({rate.rate_pct}%)
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldErrors state={state} name="vat_code" />
          </Field>
        </div>

        <Field {...field("sell_price")}>
          <FieldLabel htmlFor="sell_price">
            Selling price (£, including VAT)
          </FieldLabel>
          <Input
            id="sell_price"
            name="sell_price"
            inputMode="decimal"
            placeholder="e.g. 1.75"
            className="max-w-48"
            defaultValue={value("sell_price")}
          />
          <FieldDescription>
            The shelf price. For items sold by weight, the price per kg. Change
            it here whenever you change it on the till.
          </FieldDescription>
          <FieldErrors state={state} name="sell_price" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...field("reorder_point")}>
            <FieldLabel htmlFor="reorder_point">Reorder point</FieldLabel>
            <Input
              id="reorder_point"
              name="reorder_point"
              inputMode="decimal"
              defaultValue={value("reorder_point")}
            />
            <FieldDescription>
              Warn when stock falls to this level.
            </FieldDescription>
            <FieldErrors state={state} name="reorder_point" />
          </Field>
          <Field {...field("reorder_qty")}>
            <FieldLabel htmlFor="reorder_qty">Reorder quantity</FieldLabel>
            <Input
              id="reorder_qty"
              name="reorder_qty"
              inputMode="decimal"
              defaultValue={value("reorder_qty")}
            />
            <FieldDescription>
              How much to order, in single items or kg.
            </FieldDescription>
            <FieldErrors state={state} name="reorder_qty" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {isNew && (
            <Field {...field("barcode")}>
              <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
              <Input
                id="barcode"
                name="barcode"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Scan or type"
                defaultValue={value("barcode")}
              />
              <FieldDescription>
                You can add more barcodes afterwards.
              </FieldDescription>
              <FieldErrors state={state} name="barcode" />
            </Field>
          )}
          <Field {...field("till_code")}>
            <FieldLabel htmlFor="till_code">Till code</FieldLabel>
            <Input
              id="till_code"
              name="till_code"
              maxLength={20}
              autoComplete="off"
              className="uppercase"
              defaultValue={value("till_code")}
            />
            <FieldDescription>
              For items without a barcode, such as loose fruit.
            </FieldDescription>
            <FieldErrors state={state} name="till_code" />
          </Field>
        </div>
      </FieldGroup>

      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">
          {isNew ? "Add product" : "Save changes"}
        </SubmitButton>
        <Button variant="outline" render={<Link href={cancelHref} />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
