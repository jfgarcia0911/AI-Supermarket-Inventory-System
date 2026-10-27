import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  ZXING_WASM_SHA256,
  ZXING_WASM_VERSION,
} from "barcode-detector/ponyfill";

describe("camera barcode scanner", () => {
  it("serves the barcode engine that matches the installed library", () => {
    const served = readFileSync(
      new URL("../../public/scanner/zxing_reader.wasm", import.meta.url),
    );
    const hash = createHash("sha256").update(served).digest("hex");
    expect(
      hash,
      `public/scanner/zxing_reader.wasm is not zxing-wasm ${ZXING_WASM_VERSION}. Run npm run scanner:wasm.`,
    ).toBe(ZXING_WASM_SHA256);
  });
});
