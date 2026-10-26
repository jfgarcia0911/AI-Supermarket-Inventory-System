# AI Supermarket Inventory System

Stock control, deliveries and supplier costs for a UK supermarket. It works
**alongside the existing till**: the till keeps selling, and this app keeps
track of what was bought, what is in stock and what it cost.

The approved design, with plain-English explanations, is in
[docs/detailed-design.html](docs/detailed-design.html). Open it in a browser.

## Status

Phase 1 is complete: sign-in with four roles, products, categories, barcodes,
suppliers with their codes, case sizes and costs, spreadsheet imports, users and
settings. Next is Phase 2: the stock ledger (deliveries, adjustments, waste and
the opening stock count).

## What you need

- [Node.js](https://nodejs.org) **24 LTS**. Version 22.12 is the minimum: the
  Supabase library no longer runs on Node 20.
- Git
- Access to the Supabase project `ai-supermarket-inventory-dev`

## First-time setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the values from the Supabase
   dashboard (Project Settings > API Keys). Never commit `.env.local`.
3. Run `npm run dev` and open http://localhost:3000.

### Demo accounts (development database only)

`npm run db:seed-dev -- --confirm-dev` creates one account per role and loads
the sample products, suppliers and price lists. All four use the
`DEMO_PASSWORD` from `.env.local`.

| Email                 | Role        | Can do                                       |
| --------------------- | ----------- | -------------------------------------------- |
| `owner@example.com`   | Owner       | Everything, including users and settings     |
| `manager@example.com` | Manager     | Products, suppliers, imports, costs          |
| `staff@example.com`   | Stock staff | Look things up; no costs, no changes         |
| `viewer@example.com`  | Viewer      | Read everything, including costs; no changes |

Real people get their accounts from an owner in **Settings > Users**: the owner
sees a temporary password to pass on, and the person chooses their own the
first time they sign in.

## Everyday commands

| Command               | What it does                                     |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Runs the app on your computer, live-updating     |
| `npm test`            | Runs the unit tests                              |
| `npm run lint`        | Checks the code for common mistakes              |
| `npm run typecheck`   | Checks the TypeScript types                      |
| `npm run format`      | Tidies the code formatting                       |
| `npm run build`       | Builds the app the way Vercel does               |
| `npm run sample-data` | Regenerates the `sample-data/` folder            |
| `npm run db:push`     | Applies new database migrations to Supabase      |
| `npm run db:types`    | Refreshes the TypeScript types from the database |
| `npm run db:seed-dev` | Loads demo accounts and sample data (dev only)   |
| `npm run test:db`     | Database security tests (dev database)           |
| `npm run test:e2e`    | Browser tests (needs `npm run build` first)      |

GitHub runs the lint, type, format, unit test, sample-data and build checks
automatically on every change (`.github/workflows/ci.yml`).

## Tests

- **Unit tests** (`npm test`): barcode check digits, reading spreadsheets,
  temporary passwords and the sample data.
- **Database security tests** (`npm run test:db`): sign in as each demo role
  and prove the database itself refuses what that role may not do, such as
  stock staff reading costs or anyone but an owner managing users. They leave
  no data behind.
- **Browser tests** (`npm run test:e2e`): click through the main screens on a
  desktop and a phone-sized screen. Screenshots land in `test-results/`.

The database and browser tests need `.env.local` and the seeded development
database, so they run on a developer's computer rather than on GitHub for now.

## Project layout

| Folder                | Contents                                               |
| --------------------- | ------------------------------------------------------ |
| `src/app/(auth)`      | Sign-in, forgotten password, choosing a password       |
| `src/app/(app)`       | The app itself: dashboard, products, suppliers, …      |
| `src/components`      | Shared UI (`ui/` holds the shadcn/ui components)       |
| `src/lib`             | Shared logic: sign-in checks, imports, formatting      |
| `src/proxy.ts`        | Runs before every page; sends signed-out visitors away |
| `supabase/migrations` | The database: tables, security rules, functions        |
| `scripts`             | Sample-data generator and the development seed         |
| `tests`               | Database security tests and browser tests              |
| `sample-data`         | Generated sample files (see below)                     |
| `docs`                | Design document                                        |

## Sample data

Everything in `sample-data/` is **fictional**: invented brands, suppliers and
barcodes. Never use it for real trading. It is generated by
`npm run sample-data` and comes out identical every time.

- `products.csv`: about 250 products across 14 departments, including loose
  items sold by the kg on till codes and all three VAT rates.
- `suppliers.csv`: six suppliers.
- `supplier-products.csv`: each supplier's product codes, case sizes and case
  costs (ex VAT). Soft drinks and water also have a second, dearer supplier.
- `sales/sales_YYYY-MM-DD.csv`: 28 days of daily till sales (25 Sep to
  22 Oct 2026) with UK-style dates and refunds as negative lines. Some lines
  deliberately match no product: an open-price grocery key, carrier bags, and a
  protein bar added to the till on 15 Oct but not yet set up as a product.

The sales file layout is our best guess at a typical till export. Once we see a
real export from the shop's till, the importer will be mapped to that format.

Import templates for real data are at `/templates/products-template.csv` and
`/templates/supplier-price-list-template.csv` (also linked from the import page).

## Deploying (Vercel)

1. Import the GitHub repository at vercel.com.
2. Add these environment variables (values are in `.env.local`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY` (keep this one secret: it can manage accounts).
3. In `supabase/config.toml`, add the Vercel address to `site_url` /
   `additional_redirect_urls` and run `npx supabase config push`, so password
   reset links point at the live site.

## Environments

|             | Database                                         | App                               |
| ----------- | ------------------------------------------------ | --------------------------------- |
| Development | Supabase `ai-supermarket-inventory-dev` (London) | Your computer and Vercel previews |
| Production  | Created before the in-store pilot                | Vercel                            |
