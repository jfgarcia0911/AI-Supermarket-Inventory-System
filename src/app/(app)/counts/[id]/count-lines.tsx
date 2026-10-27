"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { COUNT_LOCATIONS } from "@/lib/counts";
import { formatQuantity } from "@/lib/format";

import { removeCountLine, updateCountLine } from "../actions";

export interface CountLineView {
  id: string;
  productName: string;
  productSize: string | null;
  soldBy: "each" | "kg";
  location: string;
  quantity: number;
  countedBy: string | null;
  countedAt: string;
}

/** One counted line, which can be corrected while the count is open. */
export function CountLine({
  line,
  countId,
  editable,
}: {
  line: CountLineView;
  countId: string;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [location, setLocation] = useState(line.location);
  const [pending, startTransition] = useTransition();

  const run = (action: () => ReturnType<typeof removeCountLine>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setEditing(false);
      } else {
        toast.error(result.message);
      }
    });

  const places = COUNT_LOCATIONS.includes(
    line.location as (typeof COUNT_LOCATIONS)[number],
  )
    ? COUNT_LOCATIONS
    : [...COUNT_LOCATIONS, line.location];

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{line.productName}</span>
        {line.productSize && (
          <span className="text-muted-foreground"> · {line.productSize}</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {line.location}
          {line.countedBy && ` · ${line.countedBy}`} · {line.countedAt}
        </span>
      </span>
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(quantity.replace(",", "."));
            if (!Number.isFinite(value) || value < 0) {
              toast.error("Enter how many you counted (0 or more).");
              return;
            }
            run(() => updateCountLine(line.id, countId, value, location));
          }}
        >
          <NativeSelect
            aria-label="Place"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-28"
          >
            {places.map((place) => (
              <NativeSelectOption key={place} value={place}>
                {place}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            aria-label={`Quantity of ${line.productName}`}
            inputMode="decimal"
            className="w-20"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Spinner />}
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <span className="flex items-center gap-1">
          <span className="w-20 text-right font-medium tabular-nums">
            {formatQuantity(line.quantity, line.soldBy)}
          </span>
          {editable && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Change ${line.productName}`}
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${line.productName}`}
                disabled={pending}
                onClick={() => run(() => removeCountLine(line.id, countId))}
              >
                <Trash2Icon />
              </Button>
            </>
          )}
        </span>
      )}
    </li>
  );
}
