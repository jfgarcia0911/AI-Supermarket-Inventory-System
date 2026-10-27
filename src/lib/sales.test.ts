import { describe, expect, it } from "vitest";

import { describeMissingDays, describePeriod } from "./sales";

describe("describePeriod", () => {
  it("names one day or a range", () => {
    expect(describePeriod("2026-10-22", "2026-10-22")).toBe("22 Oct 2026");
    expect(describePeriod("2026-09-25", "2026-10-22")).toBe(
      "25 Sept 2026 to 22 Oct 2026",
    );
  });
});

describe("describeMissingDays", () => {
  it("lists a few days and counts the rest", () => {
    const days = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];
    expect(describeMissingDays(days.slice(0, 1), 1)).toBe("23 Oct 2026");
    expect(describeMissingDays(days.slice(0, 2), 2)).toBe(
      "23 Oct 2026 and 24 Oct 2026",
    );
    expect(describeMissingDays(days, 4)).toBe(
      "23 Oct 2026, 24 Oct 2026, 25 Oct 2026 and 1 more",
    );
  });
});
