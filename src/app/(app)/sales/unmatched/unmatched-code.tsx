"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProductMatch } from "@/app/(app)/products/search";
import { ProductSearch } from "@/components/product-search";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/form-state";

import { ignoreSalesCode, matchSalesCode } from "../actions";

/** Match or ignore every unmatched till line with one code. */
export function UnmatchedCodeActions({
  code,
  lineCount,
  isBarcode,
}: {
  code: string;
  lineCount: number;
  /** A valid barcode is saved on the product; other codes get a rule. */
  isBarcode: boolean;
}) {
  const [mode, setMode] = useState<"match" | "ignore" | null>(null);
  const [product, setProduct] = useState<ProductMatch | null>(null);
  const [remember, setRemember] = useState(true);
  const [pending, startTransition] = useTransition();
  const lines = `${lineCount.toLocaleString("en-GB")} ${lineCount === 1 ? "line" : "lines"}`;

  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setMode(null);
        setProduct(null);
      } else {
        toast.error(result.message);
      }
    });

  if (mode === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setMode("match");
            setRemember(true);
          }}
        >
          Match to a product
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMode("ignore");
            setRemember(true);
          }}
        >
          Ignore
        </Button>
      </div>
    );
  }

  if (mode === "ignore") {
    return (
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm">
          Ignore {lines} with code <strong>{code}</strong>? Stock does not
          change. Use this for things you don&apos;t keep stock of, such as
          carrier bags or an open-price key.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="accent-primary"
          />
          Always ignore this code in future imports
        </label>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => ignoreSalesCode(code, remember))}
          >
            {pending && <Spinner />}
            Ignore {lines}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setMode(null)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      {product ? (
        <>
          <p className="text-sm">
            Match {lines} with code <strong>{code}</strong> to{" "}
            <strong>
              {[product.name, product.size].filter(Boolean).join(" · ")}
            </strong>
            ? Each line comes off its stock, dated on the day it was sold.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              Match this code automatically in future
              <span className="block text-xs text-muted-foreground">
                {isBarcode
                  ? `${code} is added to the product's barcodes, so scanning it works too.`
                  : `The till code ${code} is remembered for future imports.`}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => matchSalesCode(code, product.id, remember))
              }
            >
              {pending && <Spinner />}
              Match {lines}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setProduct(null)}
            >
              Choose another product
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            Which product is <strong>{code}</strong>?
          </p>
          <ProductSearch onChoose={setProduct} autoFocus />
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
