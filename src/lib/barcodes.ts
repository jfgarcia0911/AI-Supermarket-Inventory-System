const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * GS1 check digit for a barcode body (every digit except the final check
 * digit). Works for EAN-8, UPC-A, EAN-13 and GTIN-14 (case barcodes).
 */
export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) {
    throw new Error(`Barcode body must contain digits only: "${body}"`);
  }
  let sum = 0;
  // Weights alternate 3, 1, 3, ... starting from the rightmost body digit.
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Appends the GS1 check digit to a barcode body. */
export function withCheckDigit(body: string): string {
  return body + gtinCheckDigit(body);
}

/**
 * True when `code` is an EAN-8, UPC-A, EAN-13 or GTIN-14 barcode with a
 * correct check digit.
 */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) {
    return false;
  }
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}
