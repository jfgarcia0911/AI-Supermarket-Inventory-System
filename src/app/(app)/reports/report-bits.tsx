import { DownloadIcon } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateToLondonLocal } from "@/lib/london-time";
import { type DateRange, reportRange } from "@/lib/report-dates";
import { paramText } from "@/lib/search-params";

export type ReportName =
  "stock" | "movements" | "waste" | "counts" | "deliveries";

export function exportHref(report: ReportName, range?: DateRange): string {
  const search = new URLSearchParams({ report });
  if (range) {
    search.set("from", range.from);
    search.set("to", range.to);
  }
  return `/reports/export?${search}`;
}

/** The range asked for in the address, or the last 28 days. */
export function rangeFrom(params: {
  [key: string]: string | string[] | undefined;
}): DateRange {
  const today = dateToLondonLocal(new Date()).slice(0, 10);
  return reportRange(paramText(params.from), paramText(params.to), today);
}

export function RangeForm({
  path,
  report,
  range,
}: {
  path: string;
  report: ReportName;
  range: DateRange;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <Form action={path} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">From</span>
          <Input
            type="date"
            name="from"
            defaultValue={range.from}
            className="w-40"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">To</span>
          <Input
            type="date"
            name="to"
            defaultValue={range.to}
            className="w-40"
          />
        </label>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>
      <DownloadButton href={exportHref(report, range)} />
    </div>
  );
}

export function DownloadButton({
  href,
  label = "Download for Excel",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button variant="outline" render={<a href={href} download />}>
      <DownloadIcon />
      {label}
    </Button>
  );
}

export function BackToReports() {
  return (
    <p className="text-sm text-muted-foreground">
      <Link href="/reports" className="hover:underline">
        Back to reports
      </Link>
    </p>
  );
}
