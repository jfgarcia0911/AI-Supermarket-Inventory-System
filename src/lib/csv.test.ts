import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas and quotes, and leaves empty cells blank", () => {
    expect(toCsv([["a,b", 'say "hi"', null, 3]])).toBe(
      '\uFEFF"a,b","say ""hi""",,3\r\n',
    );
  });

  it("stops Excel treating text as a formula", () => {
    expect(toCsv([["=SUM(A1)", "-Sale", -2]])).toBe(
      "\uFEFF'=SUM(A1),'-Sale,-2\r\n",
    );
  });
});
