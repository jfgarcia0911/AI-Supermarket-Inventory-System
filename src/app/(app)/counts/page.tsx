import { ClipboardCheckIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import {
  COUNT_SCOPE_LABELS,
  COUNT_STATUS_BADGE,
  COUNT_STATUS_LABELS,
} from "@/lib/counts";
import { formatDateTime } from "@/lib/format";
import { canEditCatalogue } from "@/lib/roles";
import { paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Counts" };

const SHOW_OPTIONS = {
  open: "Open counts",
  approved: "Approved",
  cancelled: "Cancelled",
  all: "All counts",
} as const;

export default function CountsPage(props: PageProps<"/counts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Counts searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Counts({
  searchParams,
}: {
  searchParams: PageProps<"/counts">["searchParams"];
}) {
  const user = await requireUser();
  const showParam = paramText((await searchParams).show) ?? "open";
  const show = (
    showParam in SHOW_OPTIONS ? showParam : "open"
  ) as keyof typeof SHOW_OPTIONS;

  const supabase = await createClient();
  let query = supabase
    .from("stock_counts")
    .select(
      "id, name, scope, status, as_of, category:categories(name), lines:stock_count_lines(count)",
    )
    .order("as_of", { ascending: false })
    .limit(100);
  if (show === "open") query = query.in("status", ["in_progress", "submitted"]);
  if (show === "approved") query = query.eq("status", "approved");
  if (show === "cancelled") query = query.eq("status", "cancelled");
  const { data: counts } = await query;

  return (
    <>
      <PageHeader
        title="Counts"
        description="Counting what is really on the shelves keeps the estimated stock honest."
      >
        {canEditCatalogue(user.role) && (
          <Button render={<Link href="/counts/new" />}>
            <PlusIcon />
            Start a count
          </Button>
        )}
      </PageHeader>

      <Form action="/counts" className="flex gap-2">
        <NativeSelect
          name="show"
          defaultValue={show}
          aria-label="Show"
          className="w-48"
        >
          {Object.entries(SHOW_OPTIONS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>

      {counts?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Count</TableHead>
              <TableHead className="hidden sm:table-cell">As of</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.map((count) => (
              <TableRow key={count.id}>
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/counts/${count.id}`}
                    className="font-medium hover:underline"
                  >
                    {count.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {COUNT_SCOPE_LABELS[count.scope]}
                    {count.category && ` · ${count.category.name}`}
                    <span className="sm:hidden">
                      {" "}
                      · {formatDateTime(count.as_of)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatDateTime(count.as_of)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {count.lines[0]?.count ?? 0}
                </TableCell>
                <TableCell>
                  <Badge variant={COUNT_STATUS_BADGE[count.status]}>
                    {COUNT_STATUS_LABELS[count.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheckIcon />
            </EmptyMedia>
            <EmptyTitle>
              {show === "open" ? "No counts going on" : "No counts"}
            </EmptyTitle>
            <EmptyDescription>
              {canEditCatalogue(user.role)
                ? "Start a count after closing, or before opening, when nothing is being sold."
                : "A manager starts a count, then you can count with your phone."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
