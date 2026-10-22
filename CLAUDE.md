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

## Stack

Next.js 16 (App Router, Turbopack, Cache Components), TypeScript, Tailwind v4,
shadcn/ui (Base UI), Supabase (Postgres, Auth, Storage), Zod, Vitest.
Node 24 LTS (`.nvmrc`).

## Inventory rules that must never be broken

- Stock changes only through `stock_movements`, written by Postgres functions
  in a single transaction. The app never updates `stock_levels` directly.
- Movements are append-only. Mistakes are fixed with reversing movements.
- Quantities are `numeric(12,3)` in base units (single items or kg). Money is
  `numeric` with 4 decimal places, ex VAT unless the name says otherwise. Never
  store money or quantities as floating point.
- Every table has Row Level Security. Stock staff must never be able to read
  cost data; their screens read from staff views that leave costs out.
- Times are stored in UTC and shown in Europe/London time.
- Schema changes only as migrations in `supabase/migrations/`.
- Secrets live in `.env.local` and Vercel environment variables. Only
  `NEXT_PUBLIC_*` values may reach the browser.
