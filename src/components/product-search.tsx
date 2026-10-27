"use client";

import { ScanBarcodeIcon, SearchIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { type ProductMatch, searchProducts } from "@/app/(app)/products/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatQuantity } from "@/lib/format";

const MATCHED_BY: Record<ProductMatch["matchedBy"], string> = {
  supplier_code: "their code",
  barcode: "barcode",
  case_barcode: "case barcode",
  till_code: "till code",
  name: "name",
};

/**
 * Find a product by scanning or typing. A barcode scanner types the code and
 * presses Enter; a code that matches exactly one product is chosen straight
 * away, so scanning is one step. Names show a list to choose from.
 */
export function ProductSearch({
  onChoose,
  supplierId,
  disabled,
  autoFocus,
}: {
  onChoose: (match: ProductMatch) => void;
  supplierId?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductMatch[] | null>(null);
  const [searched, setSearched] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (match: ProductMatch) => {
    onChoose(match);
    setQuery("");
    setResults(null);
    inputRef.current?.focus();
  };

  const search = () => {
    const text = query.trim();
    if (!text) return;
    startTransition(async () => {
      const matches = await searchProducts(text, supplierId);
      setSearched(text);
      if (matches.length === 1 && matches[0].matchedBy !== "name") {
        choose(matches[0]);
        return;
      }
      setResults(matches);
    });
  };

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <div className="relative flex-1">
          <ScanBarcodeIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Scan a barcode, or type a code or name"
            aria-label="Find a product"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={disabled}
            className="pl-8"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || pending || !query.trim()}
        >
          {pending ? <Spinner /> : <SearchIcon />}
          Find
        </Button>
      </form>

      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active product matches &ldquo;{searched}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {results.map((match) => (
              <li key={`${match.id}:${match.unitsPerCase ?? ""}`}>
                <button
                  type="button"
                  onClick={() => choose(match)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {match.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[match.brand, match.size].filter(Boolean).join(" · ")}
                      {match.matchedBy !== "name" &&
                        ` · found by ${MATCHED_BY[match.matchedBy]}`}
                      {match.unitsPerCase != null &&
                        ` · case of ${formatQuantity(match.unitsPerCase, match.soldBy)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {match.onHand == null
                      ? "No stock yet"
                      : `${formatQuantity(match.onHand, match.soldBy)} in stock`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
