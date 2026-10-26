import { randomInt } from "node:crypto";

// No 0/O, 1/l/I: these passwords are read out loud or copied from a screen.
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALPHABET = LETTERS + DIGITS;

/**
 * A temporary password such as "kP7m-x3Rt-9wQa". It meets the sign-in rules
 * (10+ characters, letters and numbers) and is used only until the person
 * chooses their own.
 */
export function temporaryPassword(): string {
  for (;;) {
    const text = Array.from(
      { length: 12 },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join("");
    if (/\d/.test(text) && /[A-Za-z]/.test(text)) {
      return `${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8)}`;
    }
  }
}
