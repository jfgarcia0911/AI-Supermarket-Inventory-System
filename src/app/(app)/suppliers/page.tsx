import { PlusIcon, SearchIcon, TruckIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
import { canEditCatalogue } from "@/lib/roles";
import { paramText, searchTerm } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage(props: PageProps<"/suppliers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Suppliers searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Suppliers({
  searchParams,
}: {
  searchParams: PageProps<"/suppliers">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = paramText(params.q);
  const status = paramText(params.status) ?? "active";

  const supabase = await createClient();
  let query = supabase.from("supplier_overview").select("*").order("name");
  if (status !== "all") {
    query = query.eq("active", status === "active");
  }
  const term = q ? searchTerm(q) : "";
  if (term) {
    query = query.or(`name.ilike.*${term}*,account_number.ilike.*${term}*`);
  }
  const { data } = await query;
  const suppliers = data ?? [];

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who we buy from, and what we buy from each."
      >
        {canEditCatalogue(user.role) && (
          <Button render={<Link href="/suppliers/new" />}>
            <PlusIcon />
            Add supplier
          </Button>
        )}
      </PageHeader>

      <Form action="/suppliers" className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name or account number"
            aria-label="Search suppliers"
            className="pl-8"
          />
        </div>
        <NativeSelect name="status" defaultValue={status} aria-label="Status">
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="inactive">Switched off</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </Form>

      {suppliers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon />
            </EmptyMedia>
            <EmptyTitle>
              {q ? "No suppliers match" : "No suppliers yet"}
            </EmptyTitle>
            <EmptyDescription>
              {q
                ? "Try a different search."
                : "Add the companies that deliver to the shop."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">Deliveries</TableHead>
              <TableHead className="text-right">Products</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`/suppliers/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  {!s.active && (
                    <Badge variant="outline" className="ml-2">
                      Switched off
                    </Badge>
                  )}
                  {s.account_number && (
                    <div className="text-xs text-muted-foreground">
                      Account {s.account_number}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {s.phone ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {[
                    s.delivery_days,
                    s.lead_time_days != null
                      ? `${s.lead_time_days}-day lead time`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.product_count ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
