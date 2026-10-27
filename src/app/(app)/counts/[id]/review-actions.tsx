"use client";

import { useState } from "react";

import { ActionButton } from "@/components/action-button";

import { approveCount, cancelCount, requestRecounts } from "../actions";

export function ReviewActions({
  countId,
  flaggedIds,
  uncounted,
  canSetUncountedToZero,
  blocked,
}: {
  countId: string;
  flaggedIds: string[];
  /** Products in the count's scope that nobody counted. */
  uncounted: number;
  canSetUncountedToZero: boolean;
  /** Why it cannot be approved yet, if it cannot. */
  blocked: string | null;
}) {
  const [setToZero, setSetToZero] = useState(false);

  return (
    <div className="space-y-4">
      {canSetUncountedToZero && uncounted > 0 && (
        <fieldset className="space-y-2 rounded-lg border p-3 text-sm">
          <legend className="px-1 font-medium">
            Not counted: {uncounted.toLocaleString("en-GB")}{" "}
            {uncounted === 1 ? "product" : "products"}
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="uncounted"
              checked={!setToZero}
              onChange={() => setSetToZero(false)}
              className="accent-primary"
            />
            Leave their stock unchanged
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="uncounted"
              checked={setToZero}
              onChange={() => setSetToZero(true)}
              className="accent-primary"
            />
            Set them to zero (there were none on the shelves)
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionButton
          disabled={Boolean(blocked)}
          action={() => approveCount(countId, setToZero)}
          confirm={{
            title: "Approve this count?",
            description:
              "Stock is corrected to the counted figures, dated at the count's time. This cannot be undone, only corrected by another count or an adjustment.",
            confirmLabel: "Approve count",
          }}
        >
          Approve count
        </ActionButton>
        {flaggedIds.length > 0 && (
          <ActionButton
            variant="outline"
            action={() => requestRecounts(countId, flaggedIds)}
            confirm={{
              title: `Count ${flaggedIds.length} ${flaggedIds.length === 1 ? "product" : "products"} again?`,
              description:
                "Their counted lines are cleared and the count opens again, so staff can recount them.",
              confirmLabel: "Ask for recounts",
            }}
          >
            Ask for recounts ({flaggedIds.length})
          </ActionButton>
        )}
        <ActionButton
          variant="ghost"
          action={() => cancelCount(countId)}
          confirm={{
            title: "Cancel this count?",
            description:
              "Nothing changes in stock. The counted lines are kept with the cancelled count.",
            confirmLabel: "Cancel count",
          }}
        >
          Cancel count
        </ActionButton>
      </div>
      {blocked && <p className="text-sm text-destructive">{blocked}</p>}
    </div>
  );
}
