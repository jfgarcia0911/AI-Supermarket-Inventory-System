import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { getCategoryOptions, getVatRates } from "@/lib/catalogue";

import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default function NewProductPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProduct />
    </Suspense>
  );
}

async function NewProduct() {
  await requireRole("owner", "manager");
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
      />
    </>
  );
}
