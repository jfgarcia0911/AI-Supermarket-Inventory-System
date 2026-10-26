import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { updateSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = { title: "Edit supplier" };

export default function EditSupplierPage(
  props: PageProps<"/suppliers/[id]/edit">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditSupplier params={props.params} />
    </Suspense>
  );
}

async function EditSupplier({
  params,
}: {
  params: PageProps<"/suppliers/[id]/edit">["params"];
}) {
  await requireRole("owner", "manager");
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select(
      "name, account_number, contact_name, phone, email, payment_terms_days, delivery_days, lead_time_days, notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (!supplier) {
    notFound();
  }
  return (
    <>
      <PageHeader title={`Edit ${supplier.name}`} />
      <SupplierForm
        action={updateSupplier.bind(null, id)}
        supplier={supplier}
        cancelHref={`/suppliers/${id}`}
      />
    </>
  );
}
