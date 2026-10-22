import { withCheckDigit } from "../../src/lib/barcodes";
import {
  categories,
  suppliers,
  VAT_RATES,
  type SupplierKey,
  type SupplierSeed,
  type VatCode,
} from "./catalogue";

export interface SampleProduct {
  department: string;
  category: string;
  name: string;
  brand: string;
  size: string;
  soldBy: "each" | "kg";
  vatCode: VatCode;
  /** Shelf price including VAT (per kg for weighed items). */
  sellPrice: number;
  /** Empty for items sold on a till code. */
  barcode: string;
  caseBarcode: string;
  caseUnits: number;
  /** Empty for barcoded items. */
  tillCode: string;
  reorderPoint: number;
  reorderQty: number;
  averageDailySales: number;
}

export interface SampleSupplierProduct {
  supplier: SupplierSeed;
  supplierCode: string;
  description: string;
  product: SampleProduct;
  unitsPerCase: number;
  caseCostExVat: number;
  preferred: boolean;
}

export interface SalesRow {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  code: string;
  description: string;
  department: string;
  qty: number;
  gross: number;
  vat: number;
  net: number;
}

/** Deterministic random numbers (mulberry32), so every run writes identical files. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Random whole number of sales with the given average. */
function poisson(mean: number, random: () => number): number {
  if (mean <= 0) {
    return 0;
  }
  if (mean > 30) {
    // A normal curve is a close enough match for large averages.
    const gaussian =
      Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian));
  }
  const limit = Math.exp(-mean);
  let count = 0;
  let product = random();
  while (product > limit) {
    count++;
    product *= random();
  }
  return count;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Suppliers that also stock a category, at a slightly higher cost. */
const SECOND_SUPPLIERS: Record<string, SupplierKey> = {
  "Drinks > Soft Drinks": "drinks",
  "Drinks > Water": "drinks",
};

export function buildCatalogue(): {
  products: SampleProduct[];
  supplierProducts: SampleSupplierProduct[];
} {
  const random = seededRandom(2026);
  const supplierByKey = new Map(suppliers.map((s) => [s.key, s]));
  const companyCodes = new Map<string, string>();
  const itemCounts = new Map<string, number>();
  const supplierCodeCounts = new Map<SupplierKey, number>();
  let nextTillCode = 1001;

  const nextSupplierCode = (supplier: SupplierSeed) => {
    const count = (supplierCodeCounts.get(supplier.key) ?? 0) + 1;
    supplierCodeCounts.set(supplier.key, count);
    return supplier.codePrefix
      ? `${supplier.codePrefix}-${1000 + count}`
      : String(104000 + count * 13);
  };

  const products: SampleProduct[] = [];
  const supplierProducts: SampleSupplierProduct[] = [];

  for (const category of categories) {
    const supplier = supplierByKey.get(category.supplier)!;
    const [department, categoryName] = category.path.split(" > ");

    for (const seed of category.products) {
      const brand = seed.brand ?? category.brand;
      const soldBy = seed.soldBy ?? "each";
      const vatCode = seed.vat ?? category.vat;

      let barcode = "";
      let caseBarcode = "";
      let tillCode = "";
      if (seed.noBarcode) {
        tillCode = String(nextTillCode++);
      } else {
        // Fictional GS1 UK-style barcodes: 50 + company + item + check digit.
        if (!companyCodes.has(brand)) {
          companyCodes.set(brand, String(61200 + companyCodes.size * 37));
        }
        const item = (itemCounts.get(brand) ?? 0) + 1;
        itemCounts.set(brand, item);
        const body = `50${companyCodes.get(brand)}${String(item).padStart(5, "0")}`;
        barcode = withCheckDigit(body);
        caseBarcode = withCheckDigit(`1${body}`);
      }

      // Reorder when stock covers the delivery lead time plus a day of
      // safety stock; order two days' sales for daily deliveries, else a week.
      const lead = supplier.leadTimeDays;
      const reorderPoint =
        seed.daily === 0 ? 0 : Math.ceil(seed.daily * (lead + 1));
      const coverDays = lead <= 1 ? 2 : 7;
      const reorderQty =
        Math.max(1, Math.ceil((seed.daily * coverDays) / seed.caseUnits)) *
        seed.caseUnits;

      const product: SampleProduct = {
        department,
        category: categoryName,
        name: seed.name,
        brand,
        size: seed.size,
        soldBy,
        vatCode,
        sellPrice: seed.price,
        barcode,
        caseBarcode,
        caseUnits: seed.caseUnits,
        tillCode,
        reorderPoint,
        reorderQty,
        averageDailySales: seed.daily,
      };
      products.push(product);

      const margin = category.margin + (random() - 0.5) * 0.06;
      const unitCostExVat =
        (seed.price / (1 + VAT_RATES[vatCode])) * (1 - margin);
      const description =
        soldBy === "kg"
          ? `${seed.name} ${seed.caseUnits}KG BOX`
          : `${seed.caseUnits} X ${[brand, seed.name, seed.size].filter(Boolean).join(" ")}`;

      supplierProducts.push({
        supplier,
        supplierCode: nextSupplierCode(supplier),
        description: description.toUpperCase(),
        product,
        unitsPerCase: seed.caseUnits,
        caseCostExVat: round2(unitCostExVat * seed.caseUnits),
        preferred: true,
      });

      const secondKey = SECOND_SUPPLIERS[category.path];
      if (secondKey) {
        const second = supplierByKey.get(secondKey)!;
        supplierProducts.push({
          supplier: second,
          supplierCode: nextSupplierCode(second),
          description: description.toUpperCase(),
          product,
          unitsPerCase: seed.caseUnits,
          caseCostExVat: round2(unitCostExVat * 1.03 * seed.caseUnits),
          preferred: false,
        });
      }
    }
  }

  return { products, supplierProducts };
}

/** Sunday to Saturday. */
const DAY_FACTORS = [1.0, 0.85, 0.85, 0.9, 0.95, 1.15, 1.3];
const ALCOHOL_DAY_FACTORS = [0.9, 0.7, 0.7, 0.8, 0.9, 1.6, 1.8];

/** Till lines that are deliberately missing from the catalogue. */
export const CARRIER_BAG_CODE = withCheckDigit("509999000001");
export const PROTEIN_BAR_CODE = withCheckDigit("509999000002");
const PROTEIN_BAR_FIRST_SALE = "2026-10-15";

function tillDescription(product: SampleProduct): string {
  return [product.brand, product.name, product.size]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .slice(0, 30)
    .trim();
}

/** One day's till sales export, as the till might produce it. */
export function buildDailySales(
  products: SampleProduct[],
  isoDate: string,
): SalesRow[] {
  const random = seededRandom(hashString(isoDate));
  const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  const rows: SalesRow[] = [];

  const addRow = (
    code: string,
    description: string,
    department: string,
    qty: number,
    unitPrice: number,
    vatCode: VatCode,
  ) => {
    const gross = round2(qty * unitPrice);
    const vat = round2(gross - gross / (1 + VAT_RATES[vatCode]));
    rows.push({
      date: isoDate,
      code,
      description,
      department,
      qty,
      gross,
      vat,
      net: round2(gross - vat),
    });
  };

  for (const product of products) {
    const dayFactor =
      product.department === "Beer, Wine & Spirits"
        ? ALCOHOL_DAY_FACTORS[weekday]
        : DAY_FACTORS[weekday];
    const mean = product.averageDailySales * dayFactor;
    const qty =
      product.soldBy === "kg"
        ? round3(mean * (0.75 + random() * 0.5))
        : poisson(mean, random);
    if (qty > 0) {
      addRow(
        product.barcode || product.tillCode,
        tillDescription(product),
        product.department,
        qty,
        product.sellPrice,
        product.vatCode,
      );
    }
  }

  // Customer refunds appear as negative lines.
  const refundable = products.filter(
    (product) => product.soldBy === "each" && product.averageDailySales >= 3,
  );
  const refundCount = Math.floor(random() * 4);
  for (let i = 0; i < refundCount; i++) {
    const product = refundable[Math.floor(random() * refundable.length)];
    addRow(
      product.barcode || product.tillCode,
      tillDescription(product),
      product.department,
      -1,
      product.sellPrice,
      product.vatCode,
    );
  }

  // Lines that will not match a product: an open-price key used when a
  // barcode will not scan, carrier bags, and a new line nobody has set up.
  const openPriceQty = poisson(4, random);
  if (openPriceQty > 0) {
    const price = round2(0.5 + random() * 2.5);
    addRow(
      "DEPT01",
      "GROCERY OPEN PRICE",
      "Open Price",
      openPriceQty,
      price,
      "Z",
    );
  }
  const bagQty = poisson(25, random);
  if (bagQty > 0) {
    addRow(CARRIER_BAG_CODE, "CARRIER BAG 10P", "Sundries", bagQty, 0.1, "S");
  }
  if (isoDate >= PROTEIN_BAR_FIRST_SALE) {
    const barQty = poisson(3, random);
    if (barQty > 0) {
      addRow(
        PROTEIN_BAR_CODE,
        "PROTEIN BAR CHOCOLATE 45G",
        "Snacks & Confectionery",
        barQty,
        1.8,
        "S",
      );
    }
  }

  return rows.sort(
    (a, b) =>
      a.department.localeCompare(b.department) ||
      a.description.localeCompare(b.description) ||
      b.qty - a.qty,
  );
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

const money = (value: number) => value.toFixed(2);

function ukDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function productsCsv(products: SampleProduct[]): string {
  return toCsv([
    [
      "Category",
      "Product Name",
      "Brand",
      "Size",
      "Sold By",
      "VAT Code",
      "Sell Price",
      "Barcode",
      "Case Barcode",
      "Case Units",
      "Till Code",
      "Reorder Point",
      "Reorder Qty",
    ],
    ...products.map((product) => [
      `${product.department} > ${product.category}`,
      product.name,
      product.brand,
      product.size,
      product.soldBy,
      product.vatCode,
      money(product.sellPrice),
      product.barcode,
      product.caseBarcode,
      product.caseUnits,
      product.tillCode,
      product.reorderPoint,
      product.reorderQty,
    ]),
  ]);
}

export function suppliersCsv(): string {
  return toCsv([
    [
      "Supplier Name",
      "Account Number",
      "Phone",
      "Email",
      "Payment Terms Days",
      "Delivery Days",
      "Lead Time Days",
    ],
    ...suppliers.map((supplier) => [
      supplier.name,
      supplier.accountNumber,
      supplier.phone,
      supplier.email,
      supplier.paymentTermsDays,
      supplier.deliveryDays,
      supplier.leadTimeDays,
    ]),
  ]);
}

export function supplierProductsCsv(rows: SampleSupplierProduct[]): string {
  return toCsv([
    [
      "Supplier Name",
      "Supplier Code",
      "Supplier Description",
      "Product Barcode",
      "Product Till Code",
      "Units Per Case",
      "Case Cost Ex VAT",
      "Preferred",
    ],
    ...rows.map((row) => [
      row.supplier.name,
      row.supplierCode,
      row.description,
      row.product.barcode,
      row.product.tillCode,
      row.unitsPerCase,
      money(row.caseCostExVat),
      row.preferred ? "Yes" : "No",
    ]),
  ]);
}

export function salesCsv(rows: SalesRow[]): string {
  return toCsv([
    [
      "Date",
      "Item Code",
      "Description",
      "Department",
      "Qty Sold",
      "Gross Sales",
      "VAT",
      "Net Sales",
    ],
    ...rows.map((row) => [
      ukDate(row.date),
      row.code,
      row.description,
      row.department,
      Number.isInteger(row.qty) ? row.qty : row.qty.toFixed(3),
      money(row.gross),
      money(row.vat),
      money(row.net),
    ]),
  ]);
}
