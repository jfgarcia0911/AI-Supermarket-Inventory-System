"use client";

import {
  ArrowLeftRightIcon,
  ClipboardCheckIcon,
  PackageIcon,
  PackagePlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProductMatch } from "@/app/(app)/products/search";
import { ProductSearch } from "@/components/product-search";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { isValidGtin } from "@/lib/barcodes";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";

import {
  addScannedBarcode,
  type ProductCard,
  productCard,
  reportUnknownBarcode,
} from "./actions";

/** A search that looks like a code rather than a name. */
function looksLikeCode(text: string): boolean {
  return /^[0-9A-Z-]{4,40}$/i.test(text) && /\d/.test(text);
}

export function ScanView({
  canEdit,
  canAdjust,
  initialUnknown,
}: {
  canEdit: boolean;
  canAdjust: boolean;
  /** A barcode to start with, e.g. from an "unknown barcode" alert. */
  initialUnknown: string | null;
}) {
  const [card, setCard] = useState<ProductCard | null>(null);
  const [unknown, setUnknown] = useState<string | null>(initialUnknown);
  const [linking, setLinking] = useState(false);
  const [pending, startTransition] = useTransition();

  const show = (match: ProductMatch) =>
    startTransition(async () => {
      setUnknown(null);
      setLinking(false);
      const result = await productCard(match.id);
      if (result) setCard(result);
      else toast.error("That product could not be found.");
    });

  const report = (code: string) =>
    startTransition(async () => {
      const result = await reportUnknownBarcode(code);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });

  const link = (code: string, match: ProductMatch) =>
    startTransition(async () => {
      const result = await addScannedBarcode(match.id, code);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setUnknown(null);
      setLinking(false);
      const updated = await productCard(match.id);
      if (updated) setCard(updated);
    });

  return (
    <div className="space-y-4">
      <ProductSearch
        autoFocus
        onChoose={show}
        onNoMatch={(text) => {
          setCard(null);
          setUnknown(looksLikeCode(text) ? text.toUpperCase() : null);
        }}
      />

      {pending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Looking it up…
        </p>
      )}

      {unknown && (
        <Card>
          <CardHeader>
            <CardTitle>No product has {unknown}</CardTitle>
            <CardDescription>
              {canEdit
                ? "Add it to the product it belongs to, or add a new product."
                : "Let a manager know, and they will add it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEdit ? (
              linking ? (
                <div className="space-y-2">
                  <p className="text-sm">Which product has this barcode?</p>
                  <ProductSearch onChoose={(match) => link(unknown, match)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLinking(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {isValidGtin(unknown) && (
                    <Button onClick={() => setLinking(true)}>
                      <PackageIcon />
                      Add to an existing product
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    render={
                      <Link
                        href={`/products/new?barcode=${encodeURIComponent(unknown)}`}
                      />
                    }
                  >
                    <PackagePlusIcon />
                    Add a new product
                  </Button>
                </div>
              )
            ) : (
              <Button disabled={pending} onClick={() => report(unknown)}>
                Tell a manager
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {card && !unknown && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {[card.brand, card.name].filter(Boolean).join(" ")}
              {card.size && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {card.size}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {[card.barcodes[0] ?? card.tillCode, card.category]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="divide-y rounded-md border text-sm">
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">In stock (estimated)</dt>
                <dd
                  className={`text-lg font-semibold tabular-nums ${(card.onHand ?? 0) < 0 ? "text-destructive" : ""}`}
                >
                  {formatQuantity(card.onHand ?? 0, card.soldBy)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">Reorder at</dt>
                <dd className="tabular-nums">
                  {formatQuantity(card.reorderPoint, card.soldBy)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">Last counted</dt>
                <dd>{formatDate(card.lastCountedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">Last change</dt>
                <dd>{formatDateTime(card.lastMovementAt)}</dd>
              </div>
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              {canAdjust &&
                card.openCounts.map((count) => (
                  <Button
                    key={count.id}
                    size="lg"
                    render={
                      <Link href={`/counts/${count.id}?product=${card.id}`} />
                    }
                  >
                    <ClipboardCheckIcon />
                    Count for {count.name}
                  </Button>
                ))}
              {canAdjust && (
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href={`/adjustments?product=${card.id}`} />}
                >
                  <Trash2Icon />
                  Waste or adjust
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                render={<Link href={`/stock/movements?product=${card.id}`} />}
              >
                <ArrowLeftRightIcon />
                History
              </Button>
              <Button
                size="lg"
                variant="ghost"
                render={<Link href={`/products/${card.id}`} />}
              >
                <PackageIcon />
                Product page
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
