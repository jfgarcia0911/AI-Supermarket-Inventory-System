// Writing CSV files that open cleanly in Excel.

export type CsvValue = string | number | boolean | null | undefined;

function field(value: CsvValue): string {
  if (value == null) {
    return "";
  }
  const text = String(value);
  // Excel runs cells that start with = + - @ as formulas; a leading quote
  // keeps text such as "-Sale" as plain text. Numbers are left alone.
  const safe =
    typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Rows to CSV text: Windows line endings, and a byte-order mark so Excel
 * reads accents and £ signs correctly.
 */
export function toCsv(rows: CsvValue[][]): string {
  return (
    "\uFEFF" + rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n"
  );
}
