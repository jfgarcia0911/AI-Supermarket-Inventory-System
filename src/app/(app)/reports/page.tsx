import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ClipboardCheckIcon,
  PackageOpenIcon,
  Trash2Icon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  {
    href: "/reports/stock",
    title: "Stock on hand and value",
    description:
      "What is in stock now, by department, at average cost. Download every product for Excel.",
    icon: BoxesIcon,
  },
  {
    href: "/reports/movements",
    title: "Stock movements",
    description:
      "What came in, sold, was adjusted or counted over a period, and each product's stock at the start and end.",
    icon: ArrowLeftRightIcon,
  },
  {
    href: "/reports/waste",
    title: "Waste and adjustments",
    description: "Stock written off or found, by reason, with its cost.",
    icon: Trash2Icon,
  },
  {
    href: "/reports/counts",
    title: "Count differences",
    description:
      "Approved counts and how far the counted stock was from the expected.",
    icon: ClipboardCheckIcon,
  },
  {
    href: "/reports/deliveries",
    title: "Deliveries",
    description:
      "Deliveries and returns by supplier, with short or damaged lines and invoice totals.",
    icon: PackageOpenIcon,
  },
];

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  await requireRole("owner", "manager", "viewer");
  return (
    <>
      <PageHeader
        title="Reports"
        description="Each report can be downloaded to open in Excel. Costs are shown only to people allowed to see them."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href} className="group">
            <Card className="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <report.icon className="size-4" />
                  {report.title}
                </CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
