import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** "Showing 51–100 of 256" with previous/next links that keep the filters. */
export function PaginationLinks({
  page,
  pageSize,
  total,
  pathname,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  params: Record<string, string | undefined>;
}) {
  if (total === 0) {
    return null;
  }
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        Showing {from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of{" "}
        {total.toLocaleString("en-GB")}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={page > 1 ? <Link href={hrefFor(page - 1)} /> : undefined}
        >
          <ChevronLeftIcon />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          render={
            page < lastPage ? <Link href={hrefFor(page + 1)} /> : undefined
          }
        >
          Next
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
