import { describe, expect, it } from "vitest";

import { temporaryPassword } from "./passwords";

describe("temporaryPassword", () => {
  it("meets the sign-in rules and avoids look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const password = temporaryPassword();
      expect(password).toMatch(
        /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/,
      );
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).not.toMatch(/[01OIl]/);
    }
  });

  it("is different each time", () => {
    const passwords = new Set(Array.from({ length: 50 }, temporaryPassword));
    expect(passwords.size).toBe(50);
  });
});
