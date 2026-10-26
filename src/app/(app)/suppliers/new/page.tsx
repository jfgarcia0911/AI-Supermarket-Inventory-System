import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";

import { createSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "Add supplier" };

export default function NewSupplierPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSupplier />
    </Suspense>
  );
}

async function NewSupplier() {
  await requireRole("owner", "manager");
  return (
    <>
      <PageHeader title="Add a supplier" />
      <SupplierForm action={createSupplier} cancelHref="/suppliers" />
    </>
  );
}
