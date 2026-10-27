// The date range of a report: UK calendar days, both ends included.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface DateRange {
  from: string;
  to: string;
}

function isRealDate(text: string | undefined): text is string {
  if (!text || !ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

function shift(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Reads ?from=&to= from the address. Without them: the 28 days up to
 * yesterday (`today` is the UK date, yyyy-mm-dd). Swapped dates are put the
 * right way round, and a range is at most a year.
 */
export function reportRange(
  from: string | undefined,
  to: string | undefined,
  today: string,
): DateRange {
  let end = isRealDate(to) ? to : shift(today, -1);
  let start = isRealDate(from) ? from : shift(end, -27);
  if (start > end) {
    [start, end] = [end, start];
  }
  if (Date.parse(end) - Date.parse(start) > 365 * DAY_MS) {
    start = shift(end, -365);
  }
  return { from: start, to: end };
}
