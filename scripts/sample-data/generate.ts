// Writes the fictional sample data used for development and testing:
//   npm run sample-data
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildCatalogue,
  buildDailySales,
  buildOpeningStock,
  openingStockCsv,
  productsCsv,
  salesCsv,
  supplierProductsCsv,
  suppliersCsv,
} from "./build";

const LAST_SALES_DAY = "2026-10-22";
const SALES_DAYS = 28;

const outDir = fileURLToPath(new URL("../../sample-data/", import.meta.url));
const salesDir = `${outDir}sales/`;

function previousDays(lastIsoDate: string, count: number): string[] {
  const last = new Date(`${lastIsoDate}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(last);
    day.setUTCDate(last.getUTCDate() - (count - 1 - i));
    return day.toISOString().slice(0, 10);
  });
}

const { products, supplierProducts } = buildCatalogue();

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}products.csv`, productsCsv(products));
writeFileSync(`${outDir}suppliers.csv`, suppliersCsv());
writeFileSync(
  `${outDir}supplier-products.csv`,
  supplierProductsCsv(supplierProducts),
);
// Counted on the evening of 24 Sep 2026, the night before the sales start.
writeFileSync(
  `${outDir}opening-stock.csv`,
  openingStockCsv(buildOpeningStock(products)),
);

// Start from an empty folder so no stale days are left behind.
rmSync(salesDir, { recursive: true, force: true });
mkdirSync(salesDir, { recursive: true });
let salesRows = 0;
for (const day of previousDays(LAST_SALES_DAY, SALES_DAYS)) {
  const rows = buildDailySales(products, day);
  salesRows += rows.length;
  writeFileSync(`${salesDir}sales_${day}.csv`, salesCsv(rows));
}

console.log(
  `Wrote ${products.length} products, ${supplierProducts.length} supplier products ` +
    `and ${SALES_DAYS} days of sales (${salesRows} rows) to sample-data/`,
);
