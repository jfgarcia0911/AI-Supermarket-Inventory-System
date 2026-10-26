// Reading values from a page's URL query (?q=milk&page=2).

type Value = string | string[] | undefined;

export function paramText(value: Value): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : undefined;
}

export function paramPage(value: Value): number {
  const page = Number(paramText(value));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return Boolean(value && UUID.test(value));
}

/** Removes characters that have a meaning in database filter syntax. */
export function searchTerm(value: string): string {
  return value
    .replace(/[%*,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
