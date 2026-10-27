@AGENTS.md

# AI Supermarket Inventory System

Inventory back office for one UK supermarket (designed so more stores can be
added). It runs alongside the existing till (EPOS) and is not a point-of-sale
system. The approved design is `docs/detailed-design.html`: read the relevant
section before building a feature, and keep the design and the code in step.

## Working agreement

- The owner approves each phase before work starts. Do not begin the next phase
  without approval.
- Explain technical choices to the owner in plain, beginner-friendly language.

## Commands

- `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`,
  `npm run format`, `npm run build`
- `npm run sample-data` regenerates `sample-data/` deterministically; CI fails
  if the committed files differ from the generator's output.
- Database: write a new file in `supabase/migrations/` (never edit an applied
  one), then `npm run db:push` and `npm run db:types`.
- `npm run db:seed-dev -- --confirm-dev` loads demo accounts
  (owner/manager/staff/viewer@example.com, password `DEMO_PASSWORD`), the
  sample data, the opening stock, four weeks of deliveries and sales, and two
  in-progress deliveries into the development database (about five minutes
  the first time). Re-running changes nothing.
- `npm run test:db` (RLS tests against the dev database) and `npm run test:e2e`
  (Playwright, after `npm run build`) need `.env.local`; they are not in CI.
  Tests that change stock must undo it (void, reverse a sales import, or an
  adjustment the other way); they use the switched-off "Database test
  product" (`useTestProduct` in `tests/db/helpers.ts`), and sales tests use
  early-September 2026 days, before the sample data. Sales tests reverse
  their imports in `afterAll`. If a run is interrupted, void leftover test
  deliveries and check `stock_ledger_mismatches()`.
- Playwright: wait for `networkidle` before `setInputFiles` or clicking a
  form's controls, or the action happens before the page is interactive and
  is lost.
- Count tests use their own "Database count test product" counted as of
  August 2026, so their corrections never touch the other tests' product.

## Stack

Next.js 16 (App Router, Turbopack, Cache Components), TypeScript, Tailwind v4,
shadcn/ui (Base UI), Supabase (Postgres, Auth, Storage), Zod, Vitest,
Playwright. Node 24 LTS (`.nvmrc`); supabase-js does not run on Node 20.

## How the code is put together

- Pages under `src/app/(app)` render their per-user content inside
  `<Suspense>` and call `requireUser()` / `requireRole()` from `src/lib/auth.ts`
  first. `src/proxy.ts` only refreshes the session and redirects signed-out
  visitors; it is not the security boundary.
- Server Actions return `FormState` (`src/lib/form-state.ts`), check the role
  with `actionUser()`, validate with Zod helpers from `src/lib/validation.ts`,
  and turn database errors into plain English with `friendlyDbError()`.
- Multi-step writes are Postgres functions (`create_product`,
  `save_supplier_product`, `import_products`, …). Imports have a dry-run mode
  that does the work and rolls it back, so the preview matches the real thing.
- The browser parses spreadsheets (`src/lib/imports`); the server re-validates
  the rows with Zod and the database checks them again.
- Every stock change goes through `private.apply_movement` (movement, its cost,
  the level and the average cost). Public functions (`post_delivery`,
  `request_adjustment`, `import_opening_stock`, …) call it; nothing else
  writes the ledger tables.
- Sales (`import_sales`) match each till line by sales-code rule, then
  barcode (unit or case, leading zeros ignored), then till code; unknown codes
  are kept as unmatched lines and matched later with `match_sales_code`.
  Sales are dated at the store's `trading_day_end`, UK time.
- Counts: staff add lines (`add_count_line`), a manager reviews
  (`count_review`, `count_readiness`) and approves (`approve_count`), which
  writes corrections dated at the count's `as_of`. Staff count blind: they
  cannot read `count_review` or `stock_count_results`.
- Alerts are derived, not written by features: `private.refresh_alerts`
  works them out from the shop's state, and the dashboard and Alerts page
  call `refresh_alerts()` when they open. A new alert type belongs there.
- Reports are database functions (`report_*`) because of the 1,000-row API
  limit; `/reports/export` turns them into CSV, paging through with
  `.range()`.
- `src/components/product-search.tsx` finds products by supplier code,
  barcode, till code or name; a single code match is chosen straight away so a
  scanner works like a keyboard.

## Gotchas

- Cache Components: reading cookies or data outside `<Suspense>` fails the
  build. No `Math.random()` / `Date.now()` in anything prerendered (including
  Suspense fallbacks). `export const dynamic` is not allowed.
- Background prefetches prerender with cookies available, so `cookies()` does
  not pause them. A new Supabase client reads the clock straight away, so
  `createClient()` in `src/lib/supabase/server.ts` awaits `io()` first. Check
  the `next start` log for "blocking-prerender" errors after changes: the
  browser tests still pass when they happen.
- A `"use server"` file may export only async functions.
- shadcn/ui here is built on Base UI: use `render={<Link href=… />}`, not
  `asChild`.
- The Data API returns at most 1,000 rows: paginate, or count in a view
  (`category_overview`, `supplier_overview`).
- Generated types make every view column nullable; row types passed to RPCs as
  JSON must be `type` aliases, not interfaces.
- In `supabase/config.toml`, `[auth.email] enable_signup` must stay `true`: on
  the hosted project it switches email + password sign-in off entirely.
  Sign-ups are blocked by `[auth] enable_signup = false`.
- `private.audit()` names a row by `id`, `code`, `key`, `invoice_id` or
  `line_id`. A new audited table keyed by anything else fails every write.
- Cache Components: a client component that reads `usePathname()` must be
  inside `<Suspense>` when used in a layout (see `mobile-nav.tsx`), or the
  build fails on dynamic routes.
- The camera scanner loads its engine from `public/scanner/` (not a CDN). After
  upgrading `barcode-detector`, run `npm run scanner:wasm`; a unit test fails
  until the copy matches. `src/proxy.ts` lets the manifest and `.wasm` files
  through without a session, or installing the app breaks.
- An import preview must not try the real work when the file is already
  blocked: unique indexes (such as one sales file per fingerprint) raise an
  error inside the preview instead of the friendly "already imported".
- A form that disappears after its action (posting, voiding) must show its
  toast inside the action wrapper passed to `useActionState`, not in an
  effect: the effect never runs once the form is gone.
- The React Compiler lint (`react-hooks/purity`) rejects `Date.now()` in
  render, server components included. Put time checks in a helper in
  `src/lib` (see `isPostingOverdue`).

## Inventory rules that must never be broken

- Stock changes only through `stock_movements`, written by Postgres functions
  in a single transaction. The app never updates `stock_levels` directly.
- Movements are append-only. Mistakes are fixed with reversing movements.
- Quantities are `numeric(12,3)` in base units (single items or kg). Money is
  `numeric` with 4 decimal places, ex VAT unless the name says otherwise. Never
  store money or quantities as floating point.
- Every table has Row Level Security. Stock staff must never be able to read
  cost data: costs live in their own tables (`supplier_cost_history`,
  `stock_costs`, `stock_movement_costs`, `supplier_invoice_totals`,
  `supplier_invoice_line_costs`) that only owners, managers and viewers can
  read, and screens hide cost columns too. Never add a cost column to a table
  or view staff can read.
- Times are stored in UTC and shown in Europe/London time.
- Schema changes only as migrations in `supabase/migrations/`.
- Secrets live in `.env.local` and Vercel environment variables. Only
  `NEXT_PUBLIC_*` values may reach the browser.
