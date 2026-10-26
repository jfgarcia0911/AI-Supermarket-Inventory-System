import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import type { ImportKind } from "@/lib/imports/fields";
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
  const kind: ImportKind =
    paramText(params.kind) === "supplier_products"
      ? "supplier_products"
      : "products";
  const supplier = paramText(params.supplier);

  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <>
      <PageHeader
        title="Import from a spreadsheet"
        description="Bring in your product list, or a supplier's codes, case sizes and costs."
      />
      <ImportWizard
        suppliers={suppliers ?? []}
        initialKind={kind}
        initialSupplierId={isUuid(supplier) ? supplier : null}
      />
    </>
  );
}
