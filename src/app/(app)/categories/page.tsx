import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createClient } from "@/lib/supabase/server";

import { createCategory } from "./actions";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("category_overview")
    .select("*")
    .order("path");
  const categories = data ?? [];
  const canEdit = canEditCatalogue(user.role);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Departments and the categories inside them. Imports create missing ones automatically."
      />

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add a category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm
              action={createCategory}
              parents={categories.flatMap((c) =>
                c.id && c.path && c.active ? [{ id: c.id, path: c.path }] : [],
              )}
            />
          </CardContent>
        </Card>
      )}

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Target margin
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Expiry warning
              </TableHead>
              {canEdit && <TableHead className="text-right">Edit</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <span
                    className={
                      (c.depth ?? 1) === 1
                        ? "font-medium"
                        : "text-muted-foreground"
                    }
                    style={{ paddingLeft: `${((c.depth ?? 1) - 1) * 1.25}rem` }}
                  >
                    {(c.depth ?? 1) > 1 && "↳ "}
                    {c.name}
                  </span>
                  {!c.active && (
                    <Badge variant="outline" className="ml-2">
                      Switched off
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.product_count ? (
                    <Link
                      href={`/products?category=${encodeURIComponent(c.path ?? "")}`}
                      className="hover:underline"
                    >
                      {c.product_count}
                    </Link>
                  ) : (
                    0
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {c.target_margin_pct != null
                    ? `${c.target_margin_pct}%`
                    : "—"}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {c.expiry_warning_days != null
                    ? `${c.expiry_warning_days} days`
                    : "—"}
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Link
                      href={`/categories/${c.id}`}
                      className="text-sm hover:underline"
                    >
                      Edit
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
