-- Catalogue: categories, products, barcodes and selling-price history.

create type public.sold_by as enum ('each', 'kg');
create type public.pack_type as enum ('unit', 'case', 'outer');
create type public.price_source as enum ('manual', 'spreadsheet');

-- GS1 check digit test for EAN-8, UPC-A, EAN-13 and GTIN-14 barcodes.
-- Mirrors isValidGtin in src/lib/barcodes.ts.
create function private.is_valid_gtin(code text) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_len integer;
  v_sum integer := 0;
begin
  if code is null or code !~ '^[0-9]+$' then
    return false;
  end if;
  v_len := length(code);
  if v_len not in (8, 12, 13, 14) then
    return false;
  end if;
  -- Weights alternate 3, 1, 3, ... from the rightmost digit before the check digit.
  for i in 1 .. v_len - 1 loop
    v_sum := v_sum + substr(code, v_len - i, 1)::integer * (case when i % 2 = 1 then 3 else 1 end);
  end loop;
  return (10 - v_sum % 10) % 10 = substr(code, v_len, 1)::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories (nested: Dairy & Eggs > Milk & Cream)
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (length(btrim(name)) between 1 and 80 and position('>' in name) = 0),
  parent_id uuid references public.categories (id),
  target_margin_pct numeric(5, 2)
    check (target_margin_pct >= 0 and target_margin_pct < 100),
  expiry_warning_days integer check (expiry_warning_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);

create unique index categories_name_key
  on public.categories (parent_id, lower(name)) nulls not distinct;

create trigger categories_set_updated_at
before update on public.categories
for each row when (old is distinct from new)
execute function private.set_updated_at();

create function private.check_category_parent() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    with recursive ancestors (id, parent_id) as (
      select c.id, c.parent_id from public.categories c where c.id = new.parent_id
      union
      select c.id, c.parent_id
      from public.categories c
      join ancestors a on c.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A category cannot be placed inside itself.';
  end if;
  return new;
end;
$$;

create trigger categories_check_parent
before insert or update of parent_id on public.categories
for each row execute function private.check_category_parent();

-- Full path of every category, e.g. "Dairy & Eggs > Milk & Cream".
create view public.category_paths
with (security_invoker = true)
as
with recursive tree (id, name, parent_id, path, depth, active) as (
  select c.id, c.name, c.parent_id, c.name, 1, c.active
  from public.categories c
  where c.parent_id is null
  union all
  select c.id, c.name, c.parent_id, t.path || ' > ' || c.name, t.depth + 1, c.active
  from public.categories c
  join tree t on c.parent_id = t.id
)
select id, name, parent_id, path, depth, active from tree;

-- ---------------------------------------------------------------------------
-- Products and barcodes
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  brand text check (length(brand) <= 80),
  size text check (length(size) <= 40),
  category_id uuid not null references public.categories (id),
  sold_by public.sold_by not null default 'each',
  vat_code text not null references public.vat_rates (code),
  -- Shelf price including VAT; per kg for weighed items.
  sell_price numeric(12, 4) check (sell_price >= 0),
  reorder_point numeric(12, 3) check (reorder_point >= 0),
  reorder_qty numeric(12, 3) check (reorder_qty > 0),
  -- Item code the till uses for goods without a barcode (loose fruit, bakery).
  till_code text check (till_code ~ '^[A-Z0-9-]{1,20}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

create unique index products_till_code_key
  on public.products (till_code) where till_code is not null and active;
create index products_category_idx on public.products (category_id);
create index products_name_idx on public.products (lower(name));

create trigger products_set_updated_at
before update on public.products
for each row when (old is distinct from new)
execute function private.set_updated_at();

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  barcode text not null check (private.is_valid_gtin(barcode)),
  pack_type public.pack_type not null default 'unit',
  units_per_pack numeric(12, 3) not null default 1 check (units_per_pack > 0),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now(),
  check (pack_type <> 'unit' or units_per_pack = 1),
  check (not is_primary or pack_type = 'unit')
);

create unique index product_barcodes_barcode_key
  on public.product_barcodes (barcode) where active;
create unique index product_barcodes_primary_key
  on public.product_barcodes (product_id) where is_primary and active;
create index product_barcodes_product_idx on public.product_barcodes (product_id);

create trigger product_barcodes_set_updated_at
before update on public.product_barcodes
for each row when (old is distinct from new)
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Selling-price history (written by a trigger whenever the price changes)
-- ---------------------------------------------------------------------------

create table public.sell_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  sell_price numeric(12, 4),
  effective_from timestamptz not null default now(),
  source public.price_source not null,
  created_by uuid default auth.uid() references public.profiles (id)
);

create index sell_price_history_product_idx
  on public.sell_price_history (product_id, effective_from desc);

-- The import function sets app.price_source = 'spreadsheet' for its transaction.
create function private.record_sell_price() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.sell_price is not null)
     or (tg_op = 'UPDATE' and new.sell_price is distinct from old.sell_price) then
    insert into public.sell_price_history (product_id, sell_price, source)
    values (
      new.id,
      new.sell_price,
      coalesce(nullif(current_setting('app.price_source', true), ''), 'manual')::public.price_source
    );
  end if;
  return new;
end;
$$;

create trigger products_record_sell_price
after insert or update of sell_price on public.products
for each row execute function private.record_sell_price();

-- One row per product with its category path and barcodes, for lists and search.
create view public.product_overview
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.brand,
  p.size,
  p.category_id,
  cp.path as category_path,
  p.sold_by,
  p.vat_code,
  p.sell_price,
  p.reorder_point,
  p.reorder_qty,
  p.till_code,
  p.active,
  p.created_at,
  p.updated_at,
  (
    select b.barcode from public.product_barcodes b
    where b.product_id = p.id and b.active and b.is_primary
  ) as primary_barcode,
  coalesce(
    (
      select array_agg(b.barcode order by b.is_primary desc, b.barcode)
      from public.product_barcodes b
      where b.product_id = p.id and b.active
    ),
    '{}'
  ) as barcodes
from public.products p
join public.category_paths cp on cp.id = p.category_id;

-- ---------------------------------------------------------------------------
-- Audit and Row Level Security
-- ---------------------------------------------------------------------------

create trigger categories_audit after insert or update or delete on public.categories
for each row execute function private.audit();
create trigger products_audit after insert or update or delete on public.products
for each row execute function private.audit();
create trigger product_barcodes_audit after insert or update or delete on public.product_barcodes
for each row execute function private.audit();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.sell_price_history enable row level security;

create policy "Active users can read categories"
on public.categories for select to authenticated
using ((select private.is_active_user()));

create policy "Owners and managers can add categories"
on public.categories for insert to authenticated
with check ((select private.has_role('owner', 'manager')));

create policy "Owners and managers can update categories"
on public.categories for update to authenticated
using ((select private.has_role('owner', 'manager')))
with check ((select private.has_role('owner', 'manager')));

create policy "Active users can read products"
on public.products for select to authenticated
using ((select private.is_active_user()));

create policy "Owners and managers can add products"
on public.products for insert to authenticated
with check ((select private.has_role('owner', 'manager')));

create policy "Owners and managers can update products"
on public.products for update to authenticated
using ((select private.has_role('owner', 'manager')))
with check ((select private.has_role('owner', 'manager')));

create policy "Active users can read barcodes"
on public.product_barcodes for select to authenticated
using ((select private.is_active_user()));

create policy "Owners and managers can add barcodes"
on public.product_barcodes for insert to authenticated
with check ((select private.has_role('owner', 'manager')));

create policy "Owners and managers can update barcodes"
on public.product_barcodes for update to authenticated
using ((select private.has_role('owner', 'manager')))
with check ((select private.has_role('owner', 'manager')));

create policy "Active users can read selling-price history"
on public.sell_price_history for select to authenticated
using ((select private.is_active_user()));
