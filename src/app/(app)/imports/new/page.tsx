import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/imports/fields";
import { dateToLondonLocal } from "@/lib/london-time";
import { isUuid, paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "New import" };

export default function NewImportPage(props: PageProps<"/imports/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewImport searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewImport({
  searchParams,
}: {
  searchParams: PageProps<"/imports/new">["searchParams"];
}) {
  await requireRole("owner", "manager");
  const params = await searchParams;
  const requested = paramText(params.kind) ?? "";
  const kind: ImportKind =
    requested in IMPORT_KIND_LABELS ? (requested as ImportKind) : "sales";
  const supplier = paramText(params.supplier);

  const supabase = await createClient();
  const [{ data: suppliers }, { data: salesFormat }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "sales_file_format")
      .maybeSingle(),
  ]);
  const salesHeaders = Object.fromEntries(
    Object.entries(
      (salesFormat?.value ?? {}) as Record<string, unknown>,
    ).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  return (
    <>
      <PageHeader
        title="Import from a spreadsheet"
        description="Bring in the till's daily sales, your product list, a supplier's codes, case sizes and costs, or your opening stock-take."
      />
      <ImportWizard
        suppliers={suppliers ?? []}
        initialKind={kind}
        initialSupplierId={isUuid(supplier) ? supplier : null}
        defaultAsOf={dateToLondonLocal(new Date())}
        salesHeaders={salesHeaders}
      />
    </>
  );
}
