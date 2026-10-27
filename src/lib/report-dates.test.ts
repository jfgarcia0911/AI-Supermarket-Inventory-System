import { describe, expect, it } from "vitest";

import { reportRange } from "./report-dates";

describe("reportRange", () => {
  it("defaults to the 28 days up to yesterday", () => {
    expect(reportRange(undefined, undefined, "2026-10-28")).toEqual({
      from: "2026-09-30",
      to: "2026-10-27",
    });
  });

  it("keeps a valid range and swaps one that is the wrong way round", () => {
    expect(reportRange("2026-10-01", "2026-10-07", "2026-10-28")).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(reportRange("2026-10-07", "2026-10-01", "2026-10-28")).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("ignores dates that are not real and limits a range to a year", () => {
    expect(reportRange("2026-02-31", "2026-10-07", "2026-10-28").from).toBe(
      "2026-09-10",
    );
    expect(reportRange("2020-01-01", "2026-10-07", "2026-10-28").from).toBe(
      "2025-10-07",
    );
  });
});
