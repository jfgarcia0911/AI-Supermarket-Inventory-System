import { describe, expect, it } from "vitest";

import { isPostingOverdue } from "./deliveries";

describe("isPostingOverdue", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("is false until the limit has passed", () => {
    expect(isPostingOverdue("2026-10-26T13:00:00Z", 24, now)).toBe(false);
    expect(isPostingOverdue("2026-10-26T12:00:00Z", 24, now)).toBe(false);
  });

  it("is true once the limit has passed", () => {
    expect(isPostingOverdue("2026-10-26T11:59:00Z", 24, now)).toBe(true);
  });

  it("is false for a delivery that has not been checked in", () => {
    expect(isPostingOverdue(null, 24, now)).toBe(false);
  });
});
