import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { dateToLondonLocal } from "@/lib/london-time";
import { isUuid, paramText } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { NewDeliveryForm } from "./new-delivery-form";

export const metadata: Metadata = { title: "New delivery" };

export default function NewDeliveryPage(props: PageProps<"/deliveries/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewDelivery searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewDelivery({
  searchParams,
}: {
  searchParams: PageProps<"/deliveries/new">["searchParams"];
}) {
  await requireRole("owner", "manager", "staff");
  const supplier = paramText((await searchParams).supplier);
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <>
      <PageHeader
        title="New delivery"
        description="Start when the goods arrive. You will add the products on the next screen."
      />
      <NewDeliveryForm
        suppliers={suppliers ?? []}
        now={dateToLondonLocal(new Date())}
        supplierId={isUuid(supplier) ? supplier : undefined}
      />
    </>
  );
}
