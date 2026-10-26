// Turns database errors into messages a shop owner can act on.

interface DbError {
  code?: string;
  message: string;
  details?: string | null;
}

// Unique indexes and checks, by name, with what they mean in plain English.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  product_barcodes_barcode_key: "Another product already uses that barcode.",
  product_barcodes_barcode_check:
    "That barcode is not valid. Check the digits.",
  product_barcodes_primary_key: "This product already has a main barcode.",
  products_till_code_key: "Another product already uses that till code.",
  products_till_code_check:
    "Till codes may only use capital letters, numbers and dashes.",
  categories_name_key:
    "A category with that name already exists in the same place.",
  categories_name_check: 'Category names cannot be empty or contain ">".',
  suppliers_name_key: "A supplier with that name already exists.",
  suppliers_email_check: "That email address does not look right.",
  supplier_products_code_key:
    "This supplier already uses that code for another product.",
  supplier_products_preferred_key:
    "That product already has a preferred supplier.",
  profiles_email_key: "Someone already has an account with that email address.",
};

export function friendlyDbError(
  error: DbError | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) {
    return fallback;
  }
  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (error.message.includes(constraint)) {
      return message;
    }
  }
  switch (error.code) {
    case "42501":
      return "You do not have permission to do that.";
    case "23505":
      return "That would create a duplicate. Check whether it already exists.";
    case "23503":
      return "That refers to something that no longer exists. Refresh and try again.";
    case "23514":
      return "One of the values is not allowed. Check the form and try again.";
    case "P0001":
      // Messages raised on purpose by our database functions are written for people.
      return error.message;
    default:
      console.error("Database error", error);
      return fallback;
  }
}
