// What each kind of import expects, and how spreadsheet columns are matched
// to it automatically by their header text.

export type ImportKind = "products" | "supplier_products";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  help?: string;
  /** Header texts that mean this field, compared ignoring case and spaces. */
  synonyms: string[];
}

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  products: "Products",
  supplier_products: "Supplier price list",
};

export const IMPORT_FIELDS: Record<ImportKind, ImportField[]> = {
  products: [
    {
      key: "category",
      label: "Category",
      required: true,
      help: 'Use ">" between levels, e.g. "Dairy & Eggs > Milk".',
      synonyms: ["category", "category path", "department", "dept", "group"],
    },
    {
      key: "name",
      label: "Product name",
      required: true,
      synonyms: ["product name", "name", "product", "item name", "description"],
    },
    { key: "brand", label: "Brand", synonyms: ["brand", "manufacturer"] },
    { key: "size", label: "Size", synonyms: ["size", "pack size", "volume"] },
    {
      key: "sold_by",
      label: "Sold by",
      help: '"each" or "kg". Blank means each.',
      synonyms: ["sold by", "unit of measure", "uom", "sale unit"],
    },
    {
      key: "vat_code",
      label: "VAT",
      required: true,
      help: "Z, R or S, or the rate: 0, 5 or 20.",
      synonyms: ["vat code", "vat", "vat rate", "tax", "tax code"],
    },
    {
      key: "sell_price",
      label: "Selling price (inc VAT)",
      synonyms: [
        "sell price",
        "selling price",
        "price",
        "retail price",
        "shelf price",
        "rrp",
      ],
    },
    {
      key: "barcode",
      label: "Barcode",
      help: "Each row needs a barcode or a till code.",
      synonyms: ["barcode", "ean", "upc", "gtin", "unit barcode"],
    },
    {
      key: "case_barcode",
      label: "Case barcode",
      synonyms: ["case barcode", "outer barcode", "case ean"],
    },
    {
      key: "case_units",
      label: "Units in a case",
      synonyms: ["case units", "units per case", "case size", "case qty"],
    },
    {
      key: "till_code",
      label: "Till code",
      help: "For items without a barcode, such as loose fruit.",
      synonyms: ["till code", "plu", "item code"],
    },
    {
      key: "reorder_point",
      label: "Reorder point",
      synonyms: [
        "reorder point",
        "reorder level",
        "min stock",
        "minimum stock",
      ],
    },
    {
      key: "reorder_qty",
      label: "Reorder quantity",
      synonyms: [
        "reorder qty",
        "reorder quantity",
        "order qty",
        "order quantity",
      ],
    },
  ],
  supplier_products: [
    {
      key: "supplier_name",
      label: "Supplier name",
      help: "If the file lists several suppliers, only rows for the chosen one are imported.",
      synonyms: ["supplier name", "supplier"],
    },
    {
      key: "supplier_code",
      label: "Supplier's product code",
      required: true,
      synonyms: [
        "supplier code",
        "their code",
        "order code",
        "product code",
        "code",
      ],
    },
    {
      key: "description",
      label: "Supplier's description",
      synonyms: ["supplier description", "description", "product description"],
    },
    {
      key: "product_barcode",
      label: "Our product's barcode",
      help: "Each row needs our product's barcode or till code.",
      synonyms: ["product barcode", "barcode", "ean", "upc"],
    },
    {
      key: "product_till_code",
      label: "Our product's till code",
      synonyms: ["product till code", "till code", "plu"],
    },
    {
      key: "units_per_case",
      label: "Units per case",
      required: true,
      synonyms: [
        "units per case",
        "case units",
        "case size",
        "pack qty",
        "case qty",
      ],
    },
    {
      key: "case_cost",
      label: "Case cost (ex VAT)",
      synonyms: [
        "case cost ex vat",
        "case cost",
        "cost",
        "net price",
        "cost price",
      ],
    },
    {
      key: "preferred",
      label: "Preferred supplier",
      help: "Yes or No.",
      synonyms: ["preferred", "preferred supplier"],
    },
  ],
};

/** Field key -> index of the spreadsheet column it comes from. */
export type ColumnMapping = Record<string, number | null>;

export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Picks a column for each field whose header matches one of its synonyms.
 * Synonyms are tried in order, so "Product name" beats "Description".
 */
export function autoMatchColumns(
  headers: string[],
  fields: ImportField[],
): ColumnMapping {
  const normalised = headers.map(normaliseHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  for (const field of fields) {
    mapping[field.key] = null;
    for (const synonym of field.synonyms) {
      const wanted = normaliseHeader(synonym);
      const index = normalised.findIndex(
        (header, i) => !used.has(i) && header === wanted,
      );
      if (index !== -1) {
        mapping[field.key] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

/** Problems with the column choices that stop the import from starting. */
export function mappingProblems(
  kind: ImportKind,
  mapping: ColumnMapping,
): string[] {
  const has = (key: string) => mapping[key] != null;
  const problems = IMPORT_FIELDS[kind]
    .filter((field) => field.required && !has(field.key))
    .map((field) => `Choose the column for "${field.label}".`);

  if (kind === "products" && !has("barcode") && !has("till_code")) {
    problems.push("Choose a column for the barcode, the till code, or both.");
  }
  if (
    kind === "supplier_products" &&
    !has("product_barcode") &&
    !has("product_till_code")
  ) {
    problems.push(
      "Choose a column for our product's barcode, its till code, or both.",
    );
  }
  return problems;
}
