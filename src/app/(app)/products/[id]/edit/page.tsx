import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { getCategoryOptions, getVatRates } from "@/lib/catalogue";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { updateProduct } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default function EditProductPage(
  props: PageProps<"/products/[id]/edit">,
) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditProduct params={props.params} />
    </Suspense>
  );
}

async function EditProduct({
  params,
}: {
  params: PageProps<"/products/[id]/edit">["params"];
}) {
  await requireRole("owner", "manager");
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: product }, categories, vatRates] = await Promise.all([
    supabase
      .from("products")
      .select(
        "name, brand, size, category_id, sold_by, vat_code, sell_price, reorder_point, reorder_qty, till_code",
      )
      .eq("id", id)
      .maybeSingle(),
    getCategoryOptions(),
    getVatRates(),
  ]);
  if (!product) {
    notFound();
  }

  return (
    <>
      <PageHeader title={`Edit ${product.name}`} />
      <ProductForm
        action={updateProduct.bind(null, id)}
        categories={categories.filter(
          (c) => c.active || c.id === product.category_id,
        )}
        vatRates={vatRates}
        product={product}
        cancelHref={`/products/${id}`}
      />
    </>
  );
}
