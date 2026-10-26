import {
  FileUpIcon,
  FolderTreeIcon,
  PackageIcon,
  PlusIcon,
  TagIcon,
  TruckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { HeaderSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/imports/fields";
import { canEditCatalogue } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const supabase = await createClient();
  const count = { count: "exact" as const, head: true };

  const [products, noPrice, categories, suppliers] = await Promise.all([
    supabase.from("products").select("id", count).eq("active", true),
    supabase
      .from("products")
      .select("id", count)
      .eq("active", true)
      .is("sell_price", null),
    supabase.from("categories").select("id", count).eq("active", true),
    supabase.from("suppliers").select("id", count).eq("active", true),
  ]);
  const imports =
    user.role !== "staff"
      ? (
          await supabase
            .from("imports")
            .select("id, import_type, file_name, committed_at, rows_ok")
            .order("committed_at", { ascending: false })
            .limit(5)
        ).data
      : null;

  const canEdit = canEditCatalogue(user.role);
  const tiles = [
    {
      label: "Products",
      value: products.count,
      href: "/products",
      icon: PackageIcon,
    },
    {
      label: "Categories",
      value: categories.count,
      href: "/categories",
      icon: FolderTreeIcon,
    },
    {
      label: "Suppliers",
      value: suppliers.count,
      href: "/suppliers",
      icon: TruckIcon,
    },
    {
      label: "Missing a selling price",
      value: noPrice.count,
      href: "/products",
      icon: TagIcon,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        description="The shop's catalogue at a glance."
      >
        {canEdit && (
          <>
            <Button variant="outline" render={<Link href="/imports/new" />}>
              <FileUpIcon />
              Import
            </Button>
            <Button render={<Link href="/products/new" />}>
              <PlusIcon />
              Add product
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <tile.icon className="size-4" />
                  {tile.label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {(tile.value ?? 0).toLocaleString("en-GB")}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {imports && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            {imports.length ? (
              <ul className="divide-y text-sm">
                {imports.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap justify-between gap-2 py-2"
                  >
                    <span>
                      <span className="font-medium">
                        {IMPORT_KIND_LABELS[row.import_type as ImportKind] ??
                          row.import_type}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        · {row.file_name}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {row.rows_ok.toLocaleString("en-GB")} rows ·{" "}
                      {formatDateTime(row.committed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing imported yet.{" "}
                {canEdit && (
                  <Link href="/imports/new?kind=products" className="underline">
                    Import your product list
                  </Link>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Phase 2 adds the stock ledger: recording deliveries, adjustments and
            waste, and the opening stock count. Phase 3 brings in daily till
            sales, so stock levels stay up to date.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
