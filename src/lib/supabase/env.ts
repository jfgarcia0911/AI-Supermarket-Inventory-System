// Supabase connection settings. NEXT_PUBLIC_* values are safe for the browser;
// they are inlined at build time. Read lazily so a build without them still
// succeeds and the error only appears when the app actually needs them.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
