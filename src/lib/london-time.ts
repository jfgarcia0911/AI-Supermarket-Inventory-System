// The shop runs on UK time (GMT in winter, BST in summer); the database
// stores UTC. These convert the "YYYY-MM-DDTHH:mm" text of a date-time input,
// read as London time, to and from an exact moment.

const TIME_ZONE = "Europe/London";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function londonParts(date: Date): Record<string, number> {
  const values: Record<string, number> = {};
  for (const part of parts.formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

/** Minutes London is ahead of UTC at that moment: 0 in winter, 60 in summer. */
function londonOffsetMinutes(date: Date): number {
  const p = londonParts(date);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-27T07:40" in London → the exact moment, or null if not valid. */
export function londonLocalToDate(local: string): Date | null {
  const match = LOCAL.exec(local.trim());
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let moment = naive - londonOffsetMinutes(new Date(naive)) * 60000;
  // Near a clock change the offset can differ at the corrected moment.
  const corrected = londonOffsetMinutes(new Date(moment));
  moment = naive - corrected * 60000;
  return new Date(moment);
}

/** A moment → "YYYY-MM-DDTHH:mm" in London, for a date-time input. */
export function dateToLondonLocal(date: Date): string {
  const p = londonParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
