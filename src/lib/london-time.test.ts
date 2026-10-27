import { describe, expect, it } from "vitest";

import { dateToLondonLocal, londonLocalToDate } from "./london-time";

describe("londonLocalToDate", () => {
  it("reads winter times as GMT", () => {
    expect(londonLocalToDate("2026-11-02T07:40")?.toISOString()).toBe(
      "2026-11-02T07:40:00.000Z",
    );
  });

  it("reads summer times as BST, an hour ahead of UTC", () => {
    expect(londonLocalToDate("2026-09-24T22:30")?.toISOString()).toBe(
      "2026-09-24T21:30:00.000Z",
    );
  });

  it("handles the day the clocks go back", () => {
    // 25 Oct 2026: BST ends at 02:00, so 09:00 is GMT.
    expect(londonLocalToDate("2026-10-25T09:00")?.toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
    expect(londonLocalToDate("2026-10-24T09:00")?.toISOString()).toBe(
      "2026-10-24T08:00:00.000Z",
    );
  });

  it("rejects text that is not a date-time", () => {
    expect(londonLocalToDate("yesterday")).toBeNull();
    expect(londonLocalToDate("2026-13-01T10:00")).toBeNull();
  });
});

describe("dateToLondonLocal", () => {
  it("shows a moment as London time", () => {
    expect(dateToLondonLocal(new Date("2026-09-24T21:30:00Z"))).toBe(
      "2026-09-24T22:30",
    );
    expect(dateToLondonLocal(new Date("2026-11-02T07:40:00Z"))).toBe(
      "2026-11-02T07:40",
    );
  });

  it("round-trips with londonLocalToDate", () => {
    for (const local of [
      "2026-03-29T03:30",
      "2026-07-01T12:00",
      "2026-12-31T23:59",
    ]) {
      expect(dateToLondonLocal(londonLocalToDate(local) as Date)).toBe(local);
    }
  });
});
