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
  (owner/manager/staff/viewer@example.com, password `DEMO_PASSWORD`) and the
  sample data into the development database. Re-running changes nothing.
- `npm run test:db` (RLS tests against the dev database) and `npm run test:e2e`
  (Playwright, after `npm run build`) need `.env.local`; they are not in CI.

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

## Gotchas

- Cache Components: reading cookies or data outside `<Suspense>` fails the
  build. No `Math.random()` / `Date.now()` in anything prerendered (including
  Suspense fallbacks). `export const dynamic` is not allowed.
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

## Inventory rules that must never be broken

- Stock changes only through `stock_movements`, written by Postgres functions
  in a single transaction. The app never updates `stock_levels` directly.
- Movements are append-only. Mistakes are fixed with reversing movements.
- Quantities are `numeric(12,3)` in base units (single items or kg). Money is
  `numeric` with 4 decimal places, ex VAT unless the name says otherwise. Never
  store money or quantities as floating point.
- Every table has Row Level Security. Stock staff must never be able to read
  cost data: costs live in their own tables (`supplier_cost_history`) that only
  owners, managers and viewers can read, and screens hide cost columns too.
- Times are stored in UTC and shown in Europe/London time.
- Schema changes only as migrations in `supabase/migrations/`.
- Secrets live in `.env.local` and Vercel environment variables. Only
  `NEXT_PUBLIC_*` values may reach the browser.
