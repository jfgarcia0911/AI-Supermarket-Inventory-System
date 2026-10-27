import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { getCategoryOptions, getVatRates } from "@/lib/catalogue";
import { paramText } from "@/lib/search-params";

import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default function NewProductPage(props: PageProps<"/products/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProduct searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewProduct({
  searchParams,
}: {
  searchParams: PageProps<"/products/new">["searchParams"];
}) {
  await requireRole("owner", "manager");
  const barcode = paramText((await searchParams).barcode)?.replace(/\D/g, "");
  const [categories, vatRates] = await Promise.all([
    getCategoryOptions(),
    getVatRates(),
  ]);
  return (
    <>
      <PageHeader
        title="Add a product"
        description="For many products at once, use Imports."
      />
      <ProductForm
        action={createProduct}
        categories={categories.filter((c) => c.active)}
        vatRates={vatRates}
        cancelHref="/products"
        initialBarcode={barcode}
      />
    </>
  );
}
