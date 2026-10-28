import { cn } from "@/lib/utils";

export interface SalesDay {
  /** yyyy-mm-dd */
  day: string;
  gross: number;
  items: number;
  status: "imported" | "closed" | "missing";
}

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const weekday = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayOfMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});

function asDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

/** A round top for the scale: 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

function shortPounds(value: number): string {
  return value >= 1000
    ? `£${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`
    : `£${value}`;
}

/**
 * Daily till sales as columns. One series, so the card's title names it and
 * there is no legend. The best day is labelled; every day shows its figures
 * on hover or keyboard focus, and the numbers are also in a table below.
 */
export function SalesChart({ days }: { days: SalesDay[] }) {
  const max = niceMax(Math.max(...days.map((d) => d.gross), 0));
  const best = days.reduce<SalesDay | null>(
    (top, d) =>
      d.status === "imported" && (!top || d.gross > top.gross) ? d : top,
    null,
  );

  return (
    <div className="space-y-3">
      <div className="relative pl-10">
        {/* Gridlines, kept faint so the bars carry the meaning. */}
        <div aria-hidden className="absolute inset-y-0 right-0 left-10 h-40">
          {[1, 0.5, 0].map((share) => (
            <div
              key={share}
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ top: `${(1 - share) * 100}%` }}
            >
              <span className="absolute -top-2 -left-10 w-8 text-right text-[0.65rem] text-muted-foreground tabular-nums">
                {shortPounds(max * share)}
              </span>
            </div>
          ))}
        </div>

        <div className="relative flex h-40 items-end">
          {days.map((d) => {
            const height = (d.gross / max) * 100;
            const label =
              d.status === "imported"
                ? `${weekday.format(asDate(d.day))}: ${pounds.format(d.gross)}`
                : `${weekday.format(asDate(d.day))}: ${d.status === "closed" ? "shop closed" : "sales not imported"}`;
            return (
              <div
                key={d.day}
                tabIndex={0}
                aria-label={label}
                className="group relative flex h-full flex-1 items-end justify-center px-px outline-none"
              >
                {d.status === "imported" ? (
                  <div
                    className="w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-[filter] group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{ height: `${Math.max(height, 1)}%` }}
                  />
                ) : (
                  <div
                    className={cn(
                      "h-2 w-full max-w-6 rounded-t-[4px] border border-b-0",
                      d.status === "missing"
                        ? "border-dashed border-muted-foreground/50"
                        : "border-border bg-muted",
                    )}
                  />
                )}

                {best?.day === d.day && (
                  <span
                    className="pointer-events-none absolute -translate-y-full pb-1 text-[0.7rem] font-semibold whitespace-nowrap tabular-nums group-hover:opacity-0"
                    style={{ bottom: `${height}%` }}
                  >
                    {shortPounds(Math.round(d.gross))}
                  </span>
                )}

                {/* Hover and focus readout: the value first, the day second. */}
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
                >
                  <div className="font-display text-sm font-semibold tabular-nums">
                    {d.status === "imported"
                      ? pounds.format(d.gross)
                      : d.status === "closed"
                        ? "Shop closed"
                        : "Not imported"}
                  </div>
                  <div className="text-muted-foreground">
                    {weekday.format(asDate(d.day))}
                    {d.status === "imported" &&
                      ` · ${d.items.toLocaleString("en-GB", { maximumFractionDigits: 1 })} items and kg`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div aria-hidden className="mt-1.5 flex">
          {days.map((d, i) => {
            const date = asDate(d.day);
            const newMonth =
              i === 0 ||
              asDate(days[i - 1].day).getUTCMonth() !== date.getUTCMonth();
            return (
              <span
                key={d.day}
                className={cn(
                  "flex-1 text-center text-[0.65rem] tabular-nums",
                  d.status === "missing"
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground",
                )}
              >
                {dayOfMonth.format(date)}
                {newMonth && (
                  <span className="block text-[0.6rem] tracking-wide uppercase">
                    {monthName.format(date)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          Show the numbers
        </summary>
        <table className="mt-2 w-full max-w-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Sales inc VAT</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t">
                <td className="py-1">{weekday.format(asDate(d.day))}</td>
                <td className="py-1 text-right text-foreground">
                  {d.status === "imported"
                    ? pounds.format(d.gross)
                    : d.status === "closed"
                      ? "Closed"
                      : "Not imported"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
