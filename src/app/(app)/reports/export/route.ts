// Downloads a report as a CSV file for Excel: /reports/export?report=stock
// (and &from=yyyy-mm-dd&to=yyyy-mm-dd for reports over a period).

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { COUNT_SCOPE_LABELS } from "@/lib/counts";
import { type CsvValue, toCsv } from "@/lib/csv";
import { dateToLondonLocal } from "@/lib/london-time";
import { reportRange } from "@/lib/report-dates";
import { canSeeCosts } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const PAGE = 1000;

/** Reads every row of a report, a thousand at a time (the API's limit). */
async function allRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const londonDate = (value: string | null) =>
  value ? dateToLondonLocal(new Date(value)).slice(0, 10) : "";
const londonDateTime = (value: string | null) =>
  value ? dateToLondonLocal(new Date(value)).replace("T", " ") : "";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (
    !user ||
    !user.active ||
    user.mustChangePassword ||
    user.role === "staff"
  ) {
    return new Response("You do not have access to reports.", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const supabase = await createClient();
  const today = dateToLondonLocal(new Date()).slice(0, 10);
  const range = reportRange(
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
    today,
  );
  const period = { p_from: range.from, p_to: range.to };
  const costs = canSeeCosts(user.role);
  const money = (value: number | null) => (costs ? value : undefined);

  let name: string;
  let rows: CsvValue[][];
  try {
    switch (params.get("report")) {
      case "stock": {
        const data = await allRows((from, to) =>
          supabase.rpc("report_stock_products").range(from, to),
        );
        name = `stock-${today}`;
        rows = [
          [
            "Department",
            "Category",
            "Product",
            "Size",
            "Sold by",
            "Barcode or till code",
            "In stock",
            "Reorder point",
            "Last counted",
            ...(costs ? ["Average unit cost", "Value"] : []),
          ],
          ...data.map((r) => [
            r.department,
            r.category,
            r.product_name,
            r.product_size,
            r.sold_by,
            r.barcode,
            r.on_hand,
            r.reorder_point,
            londonDate(r.last_counted_at),
            ...(costs ? [money(r.average_unit_cost), money(r.value)] : []),
          ]),
        ];
        break;
      }
      case "movements": {
        const data = await allRows((from, to) =>
          supabase.rpc("report_movement_products", period).range(from, to),
        );
        name = `stock-movements-${range.from}-to-${range.to}`;
        rows = [
          [
            "Department",
            "Product",
            "Size",
            "Sold by",
            `Stock at start (${range.from})`,
            "Received",
            "Sold",
            "Adjusted",
            "Counted",
            "Reversed",
            `Stock at end (${range.to})`,
          ],
          ...data.map((r) => [
            r.department,
            r.product_name,
            r.product_size,
            r.sold_by,
            r.opening,
            r.received,
            r.sold,
            r.adjusted,
            r.counted,
            r.reversed,
            r.closing,
          ]),
        ];
        break;
      }
      case "waste": {
        const { data, error } = await supabase.rpc(
          "report_adjustments_by_reason",
          period,
        );
        if (error) throw error;
        name = `waste-and-adjustments-${range.from}-to-${range.to}`;
        rows = [
          [
            "Reason",
            "Adjustments",
            "Taken out",
            "Added",
            ...(costs ? ["Value"] : []),
            "Waiting for approval",
          ],
          ...(data ?? []).map((r) => [
            r.reason,
            r.adjustments,
            r.units_out,
            r.units_in,
            ...(costs ? [money(r.value)] : []),
            r.waiting,
          ]),
        ];
        break;
      }
      case "counts": {
        const { data, error } = await supabase.rpc("report_counts", period);
        if (error) throw error;
        name = `count-differences-${range.from}-to-${range.to}`;
        rows = [
          [
            "Count",
            "Type",
            "As of",
            "Products",
            "Different",
            "Found",
            "Missing",
            ...(costs ? ["Net value"] : []),
          ],
          ...(data ?? []).map((r) => [
            r.name,
            COUNT_SCOPE_LABELS[r.scope],
            londonDateTime(r.as_of),
            r.products,
            r.with_difference,
            r.units_added,
            r.units_removed,
            ...(costs ? [money(r.value)] : []),
          ]),
        ];
        break;
      }
      case "deliveries": {
        const { data, error } = await supabase.rpc(
          "report_deliveries_by_supplier",
          period,
        );
        if (error) throw error;
        name = `deliveries-${range.from}-to-${range.to}`;
        rows = [
          [
            "Supplier",
            "Deliveries",
            "Returns",
            "Lines",
            "Items and kg",
            "Problem lines",
            ...(costs ? ["Before VAT"] : []),
          ],
          ...(data ?? []).map((r) => [
            r.supplier,
            r.deliveries,
            r.returns,
            r.lines,
            r.units_received,
            r.problem_lines,
            ...(costs ? [money(r.net_total)] : []),
          ]),
        ];
        break;
      }
      default:
        return new Response("Unknown report.", { status: 404 });
    }
  } catch {
    return new Response("The report could not be made. Please try again.", {
      status: 500,
    });
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
