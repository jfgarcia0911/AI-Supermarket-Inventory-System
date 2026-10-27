// Draws the app's icons (phone home screen and browser) as PNG files:
//   npx tsx scripts/make-icons.tsx
// The shape is the storefront from the sidebar (lucide "store").

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ImageResponse } from "next/og";

const STORE_PATHS = [
  "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
  "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
  "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
];

// The app's primary colour (--primary in globals.css).
const BACKGROUND = "#171717";

/** `inset` is the empty border around the shape, as a share of the size. */
async function draw(size: number, inset: number, file: string) {
  const glyph = Math.round(size * (1 - 2 * inset));
  const image = new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
      }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {STORE_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    { width: size, height: size },
  );
  writeFileSync(file, Buffer.from(await image.arrayBuffer()));
  console.log(`wrote ${file}`);
}

async function main() {
  const icons = fileURLToPath(new URL("../public/icons/", import.meta.url));
  mkdirSync(icons, { recursive: true });
  await draw(192, 0.2, `${icons}icon-192.png`);
  await draw(512, 0.2, `${icons}icon-512.png`);
  // Phones may crop "maskable" icons to a circle, so the shape sits further in.
  await draw(512, 0.28, `${icons}icon-maskable-512.png`);
  // iPhones round the corners themselves.
  await draw(
    180,
    0.2,
    fileURLToPath(new URL("../src/app/apple-icon.png", import.meta.url)),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
