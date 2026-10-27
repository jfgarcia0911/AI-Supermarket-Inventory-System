"use client";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  autoMatchColumns,
  type ColumnMapping,
  IMPORT_FIELDS,
  IMPORT_KIND_LABELS,
  type ImportKind,
  mappingProblems,
} from "@/lib/imports/fields";
import { readSpreadsheet } from "@/lib/imports/read-file";
import {
  buildOpeningStockRows,
  buildProductRows,
  buildSupplierProductRows,
  type OpeningStockImportRow,
  type ProductImportRow,
  type RowError,
  type SheetTable,
  type SupplierProductImportRow,
} from "@/lib/imports/rows";
import type { ImportRequest, ImportSummary } from "@/lib/imports/schemas";
import { cellText } from "@/lib/imports/values";
import { londonLocalToDate } from "@/lib/london-time";

import { commitImport, previewImport } from "../actions";

type Step = "choose" | "map" | "review" | "done";

interface LoadedFile {
  name: string;
  fingerprint: string;
  table: SheetTable;
}

const KIND_DESCRIPTIONS: Record<ImportKind, string> = {
  products:
    "Add new products and update existing ones (matched by barcode or till code).",
  supplier_products:
    "A supplier's codes, case sizes and case costs for our products.",
  opening_stock:
    "Your stock-take: how many of each product were on hand when you counted.",
};

const TEMPLATES: Record<ImportKind, string> = {
  products: "/templates/products-template.csv",
  supplier_products: "/templates/supplier-price-list-template.csv",
  opening_stock: "/templates/opening-stock-template.csv",
};

interface Checked {
  rows: (ProductImportRow | SupplierProductImportRow | OpeningStockImportRow)[];
  errors: RowError[];
  ignored: number;
  summary: ImportSummary;
}

const MAX_ERRORS_SHOWN = 100;

export function ImportWizard({
  suppliers,
  initialKind,
  initialSupplierId,
  defaultAsOf,
}: {
  suppliers: { id: string; name: string }[];
  initialKind: ImportKind;
  initialSupplierId: string | null;
  /** London "YYYY-MM-DDTHH:mm" to start the stock-take time with. */
  defaultAsOf: string;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [asOf, setAsOf] = useState(defaultAsOf);
  const asOfDate = londonLocalToDate(asOf);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const supplier = suppliers.find((s) => s.id === supplierId);
  const fields = IMPORT_FIELDS[kind];
  const problems = file ? mappingProblems(kind, mapping) : [];

  const request = (
    rows: Checked["rows"],
    rowsSkipped: number,
  ): ImportRequest => {
    const common = {
      fileName: file?.name ?? "",
      fingerprint: file?.fingerprint ?? "",
      mapping,
      rowsSkipped,
    };
    if (kind === "products") {
      return { kind, ...common, rows: rows as ProductImportRow[] };
    }
    if (kind === "opening_stock") {
      return {
        kind,
        asOf: (asOfDate ?? new Date(NaN)).toISOString(),
        ...common,
        rows: rows as OpeningStockImportRow[],
      };
    }
    return {
      kind,
      supplierId,
      ...common,
      rows: rows as SupplierProductImportRow[],
    };
  };

  const chooseFile = (selected: File | undefined) => {
    setError(null);
    if (!selected) return;
    startTransition(async () => {
      try {
        const { table, fingerprint } = await readSpreadsheet(selected);
        if (table.rows.length === 0) {
          setError("The file has headings but no rows.");
          return;
        }
        if (table.rows.length > 20000) {
          setError(
            "A file can have at most 20,000 rows. Split it into smaller files.",
          );
          return;
        }
        setFile({ name: selected.name, fingerprint, table });
        setMapping(autoMatchColumns(table.headers, fields));
        setStep("map");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "The file could not be read.",
        );
      }
    });
  };

  const checkFile = () => {
    if (!file) return;
    setError(null);
    const built =
      kind === "products"
        ? buildProductRows(file.table, mapping)
        : kind === "opening_stock"
          ? buildOpeningStockRows(file.table, mapping)
          : buildSupplierProductRows(file.table, mapping, supplier?.name ?? "");
    if (built.rows.length === 0) {
      setChecked({
        rows: [],
        errors: built.errors,
        ignored: built.ignored,
        summary: {
          rows: built.errors.length,
          valid: 0,
          skipped: built.errors.length,
          errors: [],
        },
      });
      setStep("review");
      return;
    }
    startTransition(async () => {
      const response = await previewImport(
        request(built.rows, built.errors.length),
      );
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setChecked({ ...built, summary: response.summary });
      setStep("review");
    });
  };

  const runImport = () => {
    if (!checked) return;
    const dbErrorRows = new Set(checked.summary.errors.map((e) => e.row));
    const rows = checked.rows.filter((row) => !dbErrorRows.has(row.row_number));
    const skipped = checked.errors.length + dbErrorRows.size;
    setError(null);
    startTransition(async () => {
      const response = await commitImport(request(rows, skipped));
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult(response.summary);
      setStep("done");
    });
  };

  const restart = () => {
    setStep("choose");
    setFile(null);
    setChecked(null);
    setResult(null);
    setError(null);
  };

  const errorBanner = error && (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  if (step === "choose") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Choose what to import</CardTitle>
          <CardDescription>
            The file is read on this device. Nothing is saved until you have
            seen a preview and confirmed it.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-2xl space-y-6">
          {errorBanner}
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(IMPORT_KIND_LABELS) as ImportKind[]).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-muted/50"
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block font-medium">
                    {IMPORT_KIND_LABELS[option]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {KIND_DESCRIPTIONS[option]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {kind === "supplier_products" && (
            <Field>
              <FieldLabel htmlFor="supplier">Supplier</FieldLabel>
              <NativeSelect
                id="supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <NativeSelectOption value="">
                  Choose a supplier…
                </NativeSelectOption>
                {suppliers.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {suppliers.length === 0 && (
                <FieldDescription>
                  <Link href="/suppliers/new" className="underline">
                    Add a supplier
                  </Link>{" "}
                  first.
                </FieldDescription>
              )}
            </Field>
          )}

          {kind === "opening_stock" && (
            <Field data-invalid={!asOfDate}>
              <FieldLabel htmlFor="as_of">
                When was the stock counted?
              </FieldLabel>
              <Input
                id="as_of"
                type="datetime-local"
                className="max-w-60"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
              />
              <FieldDescription>
                UK time. Count outside trading hours, for example after closing,
                so no sales happen while you count. Each product can be given
                opening stock once; after that, use adjustments.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="file">Spreadsheet</FieldLabel>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx,.txt,text/csv"
              disabled={
                pending ||
                (kind === "supplier_products" && !supplierId) ||
                (kind === "opening_stock" && !asOfDate)
              }
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <FieldDescription>
              CSV or Excel (.xlsx), up to 20,000 rows. Need a starting point?{" "}
              <a
                href={TEMPLATES[kind]}
                download
                className="inline-flex items-center gap-1 underline"
              >
                <DownloadIcon className="size-3" />
                Download a template
              </a>
            </FieldDescription>
          </Field>
          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Reading the file…
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === "map" && file) {
    const example = file.table.rows[0]?.cells ?? [];
    return (
      <Card>
        <CardHeader>
          <CardTitle>2. Match the columns</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <FileSpreadsheetIcon className="size-4" />
            {file.name} · {file.table.rows.length.toLocaleString("en-GB")} rows
            {kind === "supplier_products" &&
              supplier &&
              ` · for ${supplier.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBanner}
          <p className="text-sm text-muted-foreground">
            We matched what we could from the headings. Check each one and
            choose the right column where needed.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>We need</TableHead>
                <TableHead>Column in your file</TableHead>
                <TableHead className="hidden md:table-cell">
                  First row
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => {
                const index = mapping[field.key];
                return (
                  <TableRow key={field.key}>
                    <TableCell className="align-top">
                      <span className="font-medium">{field.label}</span>
                      {field.required && (
                        <Badge variant="outline" className="ml-2">
                          Required
                        </Badge>
                      )}
                      {field.help && (
                        <div className="max-w-xs text-xs whitespace-normal text-muted-foreground">
                          {field.help}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <NativeSelect
                        aria-label={`Column for ${field.label}`}
                        value={index == null ? "" : String(index)}
                        onChange={(event) =>
                          setMapping((current) => ({
                            ...current,
                            [field.key]:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          }))
                        }
                      >
                        <NativeSelectOption value="">
                          Not in this file
                        </NativeSelectOption>
                        {file.table.headers.map((header, i) => (
                          <NativeSelectOption key={i} value={String(i)}>
                            {header || `Column ${i + 1}`}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate align-top text-muted-foreground md:table-cell">
                      {index == null
                        ? "—"
                        : cellText(example[index]) || "(blank)"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {problems.length > 0 && (
            <Alert>
              <CircleAlertIcon />
              <AlertTitle>Before you continue</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={restart} disabled={pending}>
              Back
            </Button>
            <Button
              onClick={checkFile}
              disabled={pending || problems.length > 0}
            >
              {pending && <Spinner />}
              {pending ? "Checking…" : "Check the file"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "review" && checked) {
    const allErrors = [...checked.errors, ...checked.summary.errors].sort(
      (a, b) => a.row - b.row,
    );
    const toImport = checked.rows.length - checked.summary.errors.length;
    const s = checked.summary;
    const changes =
      kind === "products"
        ? (s.new_products ?? 0) +
          (s.updated_products ?? 0) +
          (s.new_barcodes ?? 0) +
          (s.new_categories ?? 0)
        : kind === "opening_stock"
          ? (s.products_set ?? 0)
          : (s.new_links ?? 0) +
            (s.updated_links ?? 0) +
            (s.costs_recorded ?? 0);
    const stats: [string, number | undefined][] =
      kind === "products"
        ? [
            ["New products", s.new_products],
            ["Updated", s.updated_products],
            ["Already up to date", s.unchanged_products],
            ["New categories", s.new_categories],
            ["New barcodes", s.new_barcodes],
          ]
        : kind === "opening_stock"
          ? [
              ["Products given opening stock", s.products_set],
              ["Units and kg counted", s.units_counted],
            ]
          : [
              ["New products for this supplier", s.new_links],
              ["Updated", s.updated_links],
              ["Already up to date", s.unchanged_links],
              ["Costs recorded", s.costs_recorded],
              ["Price increases", s.price_increases],
            ];

    return (
      <Card>
        <CardHeader>
          <CardTitle>3. Check the preview</CardTitle>
          <CardDescription>Nothing has been saved yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorBanner}
          {toImport > 0 ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {(value ?? 0).toLocaleString("en-GB")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>No rows can be imported</AlertTitle>
              <AlertDescription>
                Fix the problems below in your file and choose it again.
              </AlertDescription>
            </Alert>
          )}

          {toImport > 0 && changes === 0 && (
            <Alert>
              <CircleCheckIcon />
              <AlertTitle>Nothing to import</AlertTitle>
              <AlertDescription>
                Everything in this file already matches what is saved.
              </AlertDescription>
            </Alert>
          )}

          {checked.ignored > 0 && (
            <p className="text-sm text-muted-foreground">
              {checked.ignored.toLocaleString("en-GB")} rows for other suppliers
              were left out.
            </p>
          )}

          {allErrors.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">
                {allErrors.length.toLocaleString("en-GB")} rows have problems
                and will be skipped
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Row</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allErrors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                    <TableRow key={`${e.row}-${e.message}`}>
                      <TableCell className="tabular-nums">{e.row}</TableCell>
                      <TableCell className="whitespace-normal">
                        {e.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {allErrors.length > MAX_ERRORS_SHOWN && (
                <p className="text-sm text-muted-foreground">
                  …and{" "}
                  {(allErrors.length - MAX_ERRORS_SHOWN).toLocaleString(
                    "en-GB",
                  )}{" "}
                  more.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setStep("map")}
              disabled={pending}
            >
              Back to columns
            </Button>
            <Button
              onClick={runImport}
              disabled={pending || toImport <= 0 || changes === 0}
            >
              {pending && <Spinner />}
              {pending
                ? "Importing…"
                : toImport <= 0 || changes === 0
                  ? "Nothing to import"
                  : `Import ${toImport.toLocaleString("en-GB")} rows${allErrors.length ? ` and skip ${allErrors.length.toLocaleString("en-GB")}` : ""}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "done" && result) {
    const summary =
      kind === "products"
        ? `${result.new_products ?? 0} new products, ${result.updated_products ?? 0} updated, ${result.unchanged_products ?? 0} already up to date.`
        : kind === "opening_stock"
          ? `${result.products_set ?? 0} products now have their opening stock.`
          : `${result.new_links ?? 0} new, ${result.updated_links ?? 0} updated, ${result.unchanged_links ?? 0} already up to date. ${result.costs_recorded ?? 0} costs recorded, ${result.price_increases ?? 0} of them increases.`;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import finished</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CircleCheckIcon />
            <AlertTitle>{file?.name} was imported</AlertTitle>
            <AlertDescription>
              {summary}
              {result.skipped > 0 &&
                ` ${result.skipped} rows with problems were skipped.`}
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            {kind === "products" ? (
              <Button render={<Link href="/products" />}>View products</Button>
            ) : kind === "opening_stock" ? (
              <Button render={<Link href="/stock" />}>View stock</Button>
            ) : (
              <Button render={<Link href={`/suppliers/${supplierId}`} />}>
                View {supplier?.name}
              </Button>
            )}
            <Button variant="outline" onClick={restart}>
              Import another file
            </Button>
            <Button variant="ghost" render={<Link href="/imports" />}>
              Import history
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
