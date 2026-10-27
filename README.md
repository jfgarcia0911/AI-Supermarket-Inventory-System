# AI Supermarket Inventory System

Stock control, deliveries and supplier costs for a UK supermarket. It works
**alongside the existing till**: the till keeps selling, and this app keeps
track of what was bought, what is in stock and what it cost.

The approved design, with plain-English explanations, is in
[docs/detailed-design.html](docs/detailed-design.html). Open it in a browser.

## Status

Phases 1 to 4 are built, which completes the first release (the MVP):

- **Phase 1:** sign-in with four roles, products, categories, barcodes,
  suppliers with their codes, case sizes and costs, spreadsheet imports, users
  and settings.
- **Phase 2:** the stock ledger. Deliveries are checked in by staff (scan or
  type each product) and priced and posted by a manager, with photos of the
  paperwork; returns to suppliers; waste and adjustments with manager approval
  over the limits; the opening stock count (import or per product); stock
  levels, average costs and the full movement history.
- **Phase 3:** daily till sales. Each morning a manager imports yesterday's
  sales export from the till; what was sold comes off stock, dated at the end
  of that trading day. Codes no product has are kept on an "unmatched" list to
  match to a product (or ignore) later. Missing days are flagged, and an owner
  can reverse a wrong import.

- **Phase 4:** the app installs on a phone's home screen; barcodes can be
  scanned with a handheld scanner or the phone camera on every product search;
  stock counts (staff count on their phones, a manager reviews the differences
  and approves); in-app alerts; basic reports that download for Excel.

Next is the in-store pilot: setting up the live database and Vercel, trying a
real export from the shop's till, and scanning with the shop's own phones and
scanners. Release 2 (expiry, prices and margins, emails) follows.

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
the sample products, suppliers and price lists, the opening stock count (as of
24 Sep 2026, 22:30), four weeks of deliveries and till sales (25 Sep to
22 Oct 2026), two deliveries still in progress, a Milk & Cream count waiting
for a manager's review and a bakery spot check being counted. The first run
takes about
five minutes. All four accounts use the `DEMO_PASSWORD` from `.env.local`.
Running it again changes nothing.

| Email                 | Role        | Can do                                              |
| --------------------- | ----------- | --------------------------------------------------- |
| `owner@example.com`   | Owner       | Everything, including users, settings and voiding   |
| `manager@example.com` | Manager     | Products, imports, sales, costs, posting, approvals |
| `staff@example.com`   | Stock staff | Check in deliveries, count, record waste; no costs  |
| `viewer@example.com`  | Viewer      | Read everything, including costs; no changes        |

Real people get their accounts from an owner in **Settings > Users**: the owner
sees a temporary password to pass on, and the person chooses their own the
first time they sign in.

## Everyday commands

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Runs the app on your computer, live-updating     |
| `npm test`             | Runs the unit tests                              |
| `npm run lint`         | Checks the code for common mistakes              |
| `npm run typecheck`    | Checks the TypeScript types                      |
| `npm run format`       | Tidies the code formatting                       |
| `npm run build`        | Builds the app the way Vercel does               |
| `npm run sample-data`  | Regenerates the `sample-data/` folder            |
| `npm run icons`        | Redraws the app icons in `public/icons`          |
| `npm run scanner:wasm` | Copies the barcode engine after upgrading it     |
| `npm run db:push`      | Applies new database migrations to Supabase      |
| `npm run db:types`     | Refreshes the TypeScript types from the database |
| `npm run db:seed-dev`  | Loads demo accounts and sample data (dev only)   |
| `npm run test:db`      | Database security tests (dev database)           |
| `npm run test:e2e`     | Browser tests (needs `npm run build` first)      |

GitHub runs the lint, type, format, unit test, sample-data and build checks
automatically on every change (`.github/workflows/ci.yml`).

## Tests

- **Unit tests** (`npm test`): barcode check digits, reading spreadsheets,
  temporary passwords, the sample data and UK time across the clock changes.
- **Database tests** (`npm run test:db`): sign in as each demo role and prove
  the database itself refuses what that role may not do, such as stock staff
  reading costs, anyone rewriting stock history, or a delivery being posted
  twice or before it adds up. Stock tests use a switched-off "Database test
  product" and undo every change, so stock levels end where they started (the
  history stays: stock movements are never deleted).
- **Browser tests** (`npm run test:e2e`): click through the main screens on a
  desktop and a phone-sized screen, including a delivery from check-in to
  posting and void, waste with approval, and a sales import that the owner
  reverses. Each run leaves a voided test delivery, a reversed sales import and
  a few cancelled-out adjustments in the history. Screenshots land in
  `test-results/`.

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
- `opening-stock.csv`: a stock-take sheet for every product, counted on the
  evening of 24 Sep 2026, the night before the sample sales start.
- `deliveries.csv`: four weeks of deliveries. Each supplier delivers on its own
  days and tops up whatever would otherwise run low before its next delivery,
  so stock stays realistic as the sales come in.
- `sales/sales_YYYY-MM-DD.csv`: 28 days of daily till sales (25 Sep to
  22 Oct 2026) with UK-style dates and refunds as negative lines. Some lines
  deliberately match no product: an open-price grocery key, carrier bags, and a
  protein bar added to the till on 15 Oct but not yet set up as a product.

The sales file layout is our best guess at a typical till export. Once we see a
real export from the shop's till, the importer will be mapped to that format.

Import templates for real data are at `/templates/sales-template.csv`,
`/templates/products-template.csv`,
`/templates/supplier-price-list-template.csv` and
`/templates/opening-stock-template.csv` (also linked from the import page).

## Using it on a phone

- **Install it:** open the site in Chrome on Android and choose **Install
  app** (or "Add to Home screen"); on an iPhone, open it in Safari, tap
  **Share** and **Add to Home Screen**. It then opens full screen from its own
  icon. It needs an internet connection.
- **Scanning:** a Bluetooth handheld scanner works anywhere you can type a
  code. The camera button next to each product search uses the phone's
  camera; the browser asks for permission the first time. Cameras only work
  on secure (https) sites, which Vercel is, and on `localhost`.

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
