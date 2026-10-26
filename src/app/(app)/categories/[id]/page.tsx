import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireRole } from "@/lib/auth";
import { isUuid } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";

import { updateCategory } from "../actions";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Edit category" };

export default function EditCategoryPage(props: PageProps<"/categories/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditCategory params={props.params} />
    </Suspense>
  );
}

async function EditCategory({
  params,
}: {
  params: PageProps<"/categories/[id]">["params"];
}) {
  await requireRole("owner", "manager");
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("category_overview")
    .select("*")
    .order("path");
  const category = categories?.find((c) => c.id === id);
  if (!category?.path) {
    notFound();
  }

  // A category cannot move inside itself or one of its own sub-categories.
  const ownPath = category.path;
  const parents = (categories ?? []).flatMap((c) =>
    c.id &&
    c.path &&
    c.active &&
    c.path !== ownPath &&
    !c.path.startsWith(`${ownPath} > `)
      ? [{ id: c.id, path: c.path }]
      : [],
  );

  return (
    <>
      <PageHeader title={`Edit ${category.name}`} description={category.path} />
      <CategoryForm
        action={updateCategory.bind(null, id)}
        parents={parents}
        category={{
          name: category.name ?? "",
          parent_id: category.parent_id,
          target_margin_pct: category.target_margin_pct,
          expiry_warning_days: category.expiry_warning_days,
          active: category.active ?? true,
        }}
      />
    </>
  );
}
