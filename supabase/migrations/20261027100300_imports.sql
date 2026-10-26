-- Spreadsheet imports: products, and supplier price lists (codes, case sizes
-- and case costs). Both functions run in two modes:
--   p_dry_run = true   work everything out, report it, then undo it (preview)
--   p_dry_run = false  do it for real, all or nothing
-- The preview and the real import share one code path, so the preview is
-- exactly what will happen.

create type public.import_type as enum ('products', 'supplier_products', 'sales');
create type public.import_status as enum ('committed', 'failed', 'reversed');

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  import_type public.import_type not null,
  store_id uuid references public.stores (id),
  supplier_id uuid references public.suppliers (id),
  file_name text not null check (length(file_name) <= 255),
  -- SHA-256 of the file, so the same sales file cannot be imported twice.
  file_fingerprint text not null check (file_fingerprint ~ '^[0-9a-f]{64}$'),
  period_start date,
  period_end date,
  column_mapping jsonb not null default '{}',
  status public.import_status not null default 'committed',
  rows_total integer not null default 0,
  rows_ok integer not null default 0,
  rows_error integer not null default 0,
  rows_unmatched integer not null default 0,
  summary jsonb not null default '{}',
  committed_by uuid default auth.uid() references public.profiles (id),
  committed_at timestamptz not null default now()
);

create unique index imports_sales_fingerprint_key
  on public.imports (file_fingerprint)
  where import_type = 'sales' and status = 'committed';
create index imports_committed_at_idx on public.imports (committed_at desc);

alter table public.imports enable row level security;

create policy "Owners, managers and viewers can read imports"
on public.imports for select to authenticated
using ((select private.has_role('owner', 'manager', 'viewer')));

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
-- p_rows: [{row_number, category, name, brand, size, sold_by, vat_code,
--           sell_price, barcode, case_barcode, case_units, till_code,
--           reorder_point, reorder_qty}, ...]
-- Products are recognised by barcode, then by till code. Blank optional cells
-- never wipe out existing values.

create function public.import_products(
  p_rows jsonb,
  p_file_name text,
  p_fingerprint text,
  p_mapping jsonb default '{}',
  p_rows_skipped integer default 0,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_part text;
  v_parent uuid;
  v_category uuid;
  v_new_categories integer := 0;
  v_new_barcodes integer := 0;
  v_case_barcodes integer := 0;
  v_errors integer;
  v_valid integer;
  v_import_id uuid;
  v_result jsonb;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can import products.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'A file can have at most 20,000 rows. Split it into smaller files.';
  end if;

  drop table if exists pg_temp.import_rows;
  create temporary table import_rows on commit drop as
  select
    r.row_number,
    nullif(btrim(r.category), '') as category,
    nullif(btrim(r.name), '') as name,
    nullif(btrim(r.brand), '') as brand,
    nullif(btrim(r.size), '') as size,
    nullif(lower(btrim(r.sold_by)), '') as sold_by,
    nullif(upper(btrim(r.vat_code)), '') as vat_code,
    r.sell_price,
    nullif(btrim(r.barcode), '') as barcode,
    nullif(btrim(r.case_barcode), '') as case_barcode,
    r.case_units,
    nullif(upper(btrim(r.till_code)), '') as till_code,
    r.reorder_point,
    r.reorder_qty,
    null::uuid as product_id,
    null::uuid as category_id,
    false as is_new,
    false as changed,
    null::text as error
  from jsonb_to_recordset(p_rows) as r (
    row_number integer, category text, name text, brand text, size text,
    sold_by text, vat_code text, sell_price numeric, barcode text,
    case_barcode text, case_units numeric, till_code text,
    reorder_point numeric, reorder_qty numeric
  );

  -- Row checks. Each row keeps its first problem only.
  update pg_temp.import_rows set error = 'The product name is missing.'
  where name is null;
  update pg_temp.import_rows set error = 'The category is missing.'
  where error is null and category is null;
  update pg_temp.import_rows set error = 'A category name in the path is empty.'
  where error is null
    and exists (select 1 from unnest(string_to_array(category, '>')) part where btrim(part) = '');
  update pg_temp.import_rows set error = 'The product name is longer than 120 characters.'
  where error is null and length(name) > 120;
  update pg_temp.import_rows set error = 'Each row needs a barcode or a till code.'
  where error is null and barcode is null and till_code is null;
  update pg_temp.import_rows set error = format('Barcode %s is not a valid EAN or UPC barcode.', barcode)
  where error is null and barcode is not null and not private.is_valid_gtin(barcode);
  update pg_temp.import_rows set error = format('Case barcode %s is not a valid barcode.', case_barcode)
  where error is null and case_barcode is not null and not private.is_valid_gtin(case_barcode);
  update pg_temp.import_rows set error = 'A case barcode needs the number of units in the case.'
  where error is null and case_barcode is not null and (case_units is null or case_units <= 0);
  update pg_temp.import_rows set error = 'Till codes may only use letters, numbers and dashes (up to 20).'
  where error is null and till_code is not null and till_code !~ '^[A-Z0-9-]{1,20}$';
  update pg_temp.import_rows r set error = 'The VAT code must be Z (0%), R (5%) or S (20%).'
  where error is null
    and (vat_code is null or not exists (
      select 1 from public.vat_rates v where v.code = r.vat_code and v.active));
  update pg_temp.import_rows set error = 'Sold by must be "each" or "kg".'
  where error is null and sold_by is not null and sold_by not in ('each', 'kg');
  update pg_temp.import_rows set error = 'Prices and reorder amounts cannot be negative.'
  where error is null and (sell_price < 0 or reorder_point < 0 or reorder_qty <= 0);

  -- The same barcode or till code twice in one file.
  with codes as (
    select barcode as code from pg_temp.import_rows where barcode is not null
    union all
    select case_barcode from pg_temp.import_rows where case_barcode is not null
  ),
  repeated as (select code from codes group by code having count(*) > 1)
  update pg_temp.import_rows set error = 'This barcode appears more than once in the file.'
  where error is null
    and (barcode in (select code from repeated) or case_barcode in (select code from repeated));

  with repeated as (
    select till_code from pg_temp.import_rows
    where till_code is not null group by till_code having count(*) > 1
  )
  update pg_temp.import_rows set error = 'This till code appears more than once in the file.'
  where error is null and till_code in (select till_code from repeated);

  -- Recognise existing products: barcode first, then till code.
  update pg_temp.import_rows r
  set error = format('Barcode %s is already a case barcode for "%s".', r.barcode, p.name)
  from public.product_barcodes b
  join public.products p on p.id = b.product_id
  where r.error is null and b.active and b.barcode = r.barcode and b.pack_type <> 'unit';

  update pg_temp.import_rows r set product_id = b.product_id
  from public.product_barcodes b
  where r.error is null and b.active and b.barcode = r.barcode;

  update pg_temp.import_rows r
  set error = format('Till code %s already belongs to "%s".', r.till_code, p.name)
  from public.products p
  where r.error is null and r.product_id is not null and p.active
    and p.till_code = r.till_code and p.id <> r.product_id;

  update pg_temp.import_rows r set product_id = p.id
  from public.products p
  where r.error is null and r.product_id is null and p.active and p.till_code = r.till_code;

  with repeated as (
    select product_id from pg_temp.import_rows
    where error is null and product_id is not null
    group by product_id having count(*) > 1
  )
  update pg_temp.import_rows set error = 'Two rows in the file describe the same product.'
  where error is null and product_id in (select product_id from repeated);

  update pg_temp.import_rows r
  set error = format('Case barcode %s already belongs to "%s".', r.case_barcode, p.name)
  from public.product_barcodes b
  join public.products p on p.id = b.product_id
  where r.error is null and r.case_barcode is not null and b.active
    and b.barcode = r.case_barcode
    and (r.product_id is null or b.product_id <> r.product_id);

  select count(*) filter (where error is not null), count(*) filter (where error is null)
  into v_errors, v_valid
  from pg_temp.import_rows;

  if not p_dry_run and v_errors > 0 then
    raise exception 'The file now has % row(s) with problems. Check it again before importing.', v_errors;
  end if;
  if not p_dry_run and v_valid = 0 then
    raise exception 'There is nothing to import.';
  end if;

  begin
    perform set_config('app.price_source', 'spreadsheet', true);

    -- Find or create every level of each category path.
    for v_path in select distinct category from pg_temp.import_rows where error is null loop
      v_parent := null;
      foreach v_part in array string_to_array(v_path, '>') loop
        v_part := btrim(v_part);
        select id into v_category
        from public.categories
        where parent_id is not distinct from v_parent and lower(name) = lower(v_part);
        if found then
          update public.categories set active = true where id = v_category and not active;
        else
          insert into public.categories (name, parent_id)
          values (v_part, v_parent)
          returning id into v_category;
          v_new_categories := v_new_categories + 1;
        end if;
        v_parent := v_category;
      end loop;
      update pg_temp.import_rows set category_id = v_parent
      where error is null and category = v_path;
    end loop;

    -- New products.
    update pg_temp.import_rows set product_id = gen_random_uuid(), is_new = true
    where error is null and product_id is null;

    insert into public.products
      (id, name, brand, size, category_id, sold_by, vat_code, sell_price,
       reorder_point, reorder_qty, till_code)
    select product_id, name, brand, size, category_id,
           coalesce(sold_by, 'each')::public.sold_by, vat_code, sell_price,
           reorder_point, reorder_qty, till_code
    from pg_temp.import_rows
    where is_new;

    -- Existing products that the file changes.
    update pg_temp.import_rows r set changed = true
    from public.products p
    where p.id = r.product_id and r.error is null and not r.is_new
      and (
        p.name is distinct from r.name
        or p.category_id is distinct from r.category_id
        or p.vat_code is distinct from r.vat_code
        or not p.active
        or (r.brand is not null and p.brand is distinct from r.brand)
        or (r.size is not null and p.size is distinct from r.size)
        or (r.sold_by is not null and p.sold_by::text is distinct from r.sold_by)
        or (r.sell_price is not null and p.sell_price is distinct from r.sell_price)
        or (r.reorder_point is not null and p.reorder_point is distinct from r.reorder_point)
        or (r.reorder_qty is not null and p.reorder_qty is distinct from r.reorder_qty)
        or (r.till_code is not null and p.till_code is distinct from r.till_code)
      );

    update public.products p set
      name = r.name,
      category_id = r.category_id,
      vat_code = r.vat_code,
      active = true,
      brand = coalesce(r.brand, p.brand),
      size = coalesce(r.size, p.size),
      sold_by = coalesce(r.sold_by::public.sold_by, p.sold_by),
      sell_price = coalesce(r.sell_price, p.sell_price),
      reorder_point = coalesce(r.reorder_point, p.reorder_point),
      reorder_qty = coalesce(r.reorder_qty, p.reorder_qty),
      till_code = coalesce(r.till_code, p.till_code)
    from pg_temp.import_rows r
    where r.product_id = p.id and r.changed;

    -- Barcodes the products do not have yet.
    insert into public.product_barcodes (product_id, barcode, pack_type, units_per_pack, is_primary)
    select r.product_id, r.barcode, 'unit', 1,
           not exists (
             select 1 from public.product_barcodes b
             where b.product_id = r.product_id and b.is_primary and b.active)
    from pg_temp.import_rows r
    where r.error is null and r.barcode is not null
      and not exists (
        select 1 from public.product_barcodes b where b.barcode = r.barcode and b.active);
    get diagnostics v_new_barcodes = row_count;

    insert into public.product_barcodes (product_id, barcode, pack_type, units_per_pack)
    select r.product_id, r.case_barcode, 'case', r.case_units
    from pg_temp.import_rows r
    where r.error is null and r.case_barcode is not null
      and not exists (
        select 1 from public.product_barcodes b where b.barcode = r.case_barcode and b.active);
    get diagnostics v_case_barcodes = row_count;

    select jsonb_build_object(
      'rows', count(*) + p_rows_skipped,
      'valid', count(*) filter (where error is null),
      'skipped', p_rows_skipped,
      'new_products', count(*) filter (where is_new),
      'updated_products', count(*) filter (where changed),
      'unchanged_products', count(*) filter (where error is null and not is_new and not changed),
      'new_categories', v_new_categories,
      'new_barcodes', v_new_barcodes + v_case_barcodes,
      'errors', coalesce(
        jsonb_agg(jsonb_build_object('row', row_number, 'message', error) order by row_number)
          filter (where error is not null),
        '[]'::jsonb)
    )
    into v_result
    from pg_temp.import_rows;

    if p_dry_run then
      raise sqlstate 'DRY01';
    end if;

    insert into public.imports
      (import_type, file_name, file_fingerprint, column_mapping,
       rows_total, rows_ok, rows_error, summary)
    values (
      'products', p_file_name, p_fingerprint, coalesce(p_mapping, '{}'),
      (v_result ->> 'rows')::integer, v_valid, p_rows_skipped,
      v_result - 'errors'
    )
    returning id into v_import_id;

    v_result := v_result || jsonb_build_object('import_id', v_import_id);
  exception
    when sqlstate 'DRY01' then
      null; -- Preview only: everything above is undone, the summary is kept.
  end;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier price lists
-- ---------------------------------------------------------------------------
-- p_rows: [{row_number, supplier_code, description, product_code,
--           units_per_case, case_cost, preferred}, ...]
-- product_code is any barcode of the product (unit or case) or its till code.

create function public.import_supplier_products(
  p_supplier_id uuid,
  p_rows jsonb,
  p_file_name text,
  p_fingerprint text,
  p_mapping jsonb default '{}',
  p_rows_skipped integer default 0,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_errors integer;
  v_valid integer;
  v_costs integer := 0;
  v_increases integer := 0;
  v_import_id uuid;
  v_result jsonb;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can import supplier price lists.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and active) then
    raise exception 'Choose an active supplier for this price list.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'A file can have at most 20,000 rows. Split it into smaller files.';
  end if;

  drop table if exists pg_temp.import_rows;
  create temporary table import_rows on commit drop as
  select
    r.row_number,
    nullif(btrim(r.supplier_code), '') as supplier_code,
    nullif(btrim(r.description), '') as description,
    nullif(btrim(r.product_code), '') as product_code,
    r.units_per_case,
    r.case_cost,
    r.preferred,
    null::uuid as product_id,
    null::uuid as supplier_product_id,
    false as is_new,
    false as changed,
    null::text as error
  from jsonb_to_recordset(p_rows) as r (
    row_number integer, supplier_code text, description text, product_code text,
    units_per_case numeric, case_cost numeric, preferred boolean
  );

  update pg_temp.import_rows set error = 'The supplier''s product code is missing.'
  where supplier_code is null;
  update pg_temp.import_rows set error = 'The supplier''s product code is longer than 40 characters.'
  where error is null and length(supplier_code) > 40;
  update pg_temp.import_rows set error = 'The barcode or till code of our product is missing.'
  where error is null and product_code is null;
  update pg_temp.import_rows set error = 'Units per case must be more than zero.'
  where error is null and (units_per_case is null or units_per_case <= 0);
  update pg_temp.import_rows set error = 'The case cost cannot be negative.'
  where error is null and case_cost < 0;
  update pg_temp.import_rows set description = left(description, 200)
  where length(description) > 200;

  with repeated as (
    select upper(supplier_code) as code from pg_temp.import_rows
    where supplier_code is not null group by upper(supplier_code) having count(*) > 1
  )
  update pg_temp.import_rows set error = 'This supplier code appears more than once in the file.'
  where error is null and upper(supplier_code) in (select code from repeated);

  -- Our product: any active barcode (unit or case), otherwise the till code.
  update pg_temp.import_rows r set product_id = b.product_id
  from public.product_barcodes b
  join public.products p on p.id = b.product_id and p.active
  where r.error is null and b.active and b.barcode = r.product_code;

  update pg_temp.import_rows r set product_id = p.id
  from public.products p
  where r.error is null and r.product_id is null and p.active
    and p.till_code = upper(r.product_code);

  update pg_temp.import_rows
  set error = format('No product has barcode or till code %s. Add or import the product first.', product_code)
  where error is null and product_id is null;

  with repeated as (
    select product_id from pg_temp.import_rows
    where error is null and preferred group by product_id having count(*) > 1
  )
  update pg_temp.import_rows set error = 'Only one row per product can be marked as preferred.'
  where error is null and preferred and product_id in (select product_id from repeated);

  -- Existing links for this supplier, by their code.
  update pg_temp.import_rows r set supplier_product_id = sp.id
  from public.supplier_products sp
  where r.error is null and sp.supplier_id = p_supplier_id and sp.active
    and upper(sp.supplier_code) = upper(r.supplier_code);

  select count(*) filter (where error is not null), count(*) filter (where error is null)
  into v_errors, v_valid
  from pg_temp.import_rows;

  if not p_dry_run and v_errors > 0 then
    raise exception 'The file now has % row(s) with problems. Check it again before importing.', v_errors;
  end if;
  if not p_dry_run and v_valid = 0 then
    raise exception 'There is nothing to import.';
  end if;

  begin
    update pg_temp.import_rows set supplier_product_id = gen_random_uuid(), is_new = true
    where error is null and supplier_product_id is null;

    insert into public.supplier_products
      (id, supplier_id, product_id, supplier_code, supplier_description, units_per_case)
    select supplier_product_id, p_supplier_id, product_id, supplier_code, description, units_per_case
    from pg_temp.import_rows
    where is_new;

    update pg_temp.import_rows r set changed = true
    from public.supplier_products sp
    where sp.id = r.supplier_product_id and r.error is null and not r.is_new
      and (
        sp.product_id is distinct from r.product_id
        or sp.units_per_case is distinct from r.units_per_case
        or sp.supplier_code is distinct from r.supplier_code
        or (r.description is not null and sp.supplier_description is distinct from r.description)
      );

    update public.supplier_products sp set
      product_id = r.product_id,
      units_per_case = r.units_per_case,
      supplier_code = r.supplier_code,
      supplier_description = coalesce(r.description, sp.supplier_description)
    from pg_temp.import_rows r
    where sp.id = r.supplier_product_id and r.changed;

    -- Preferred supplier: rows marked "yes" win; otherwise products with no
    -- preferred supplier yet get this one.
    update public.supplier_products sp set is_preferred = false
    from pg_temp.import_rows r
    where r.error is null and r.preferred and sp.product_id = r.product_id
      and sp.is_preferred and sp.id <> r.supplier_product_id;

    update public.supplier_products sp set is_preferred = true
    from pg_temp.import_rows r
    where r.error is null and r.preferred and sp.id = r.supplier_product_id;

    update public.supplier_products sp set is_preferred = false
    from pg_temp.import_rows r
    where r.error is null and r.preferred is false and sp.id = r.supplier_product_id;

    update public.supplier_products sp set is_preferred = true
    where sp.id in (
      select distinct on (r.product_id) r.supplier_product_id
      from pg_temp.import_rows r
      where r.error is null and r.preferred is null
        and not exists (
          select 1 from public.supplier_products x
          where x.product_id = r.product_id and x.is_preferred and x.active)
      order by r.product_id, r.row_number
    );

    -- Costs that differ from the latest one on record.
    with latest as (
      select distinct on (h.supplier_product_id)
        h.supplier_product_id, h.case_cost, h.unit_cost
      from public.supplier_cost_history h
      where h.supplier_product_id in (select supplier_product_id from pg_temp.import_rows)
      order by h.supplier_product_id, h.effective_date desc, h.created_at desc
    ),
    added as (
      insert into public.supplier_cost_history
        (supplier_product_id, case_cost, unit_cost, change_pct, source)
      select
        r.supplier_product_id,
        r.case_cost,
        round(r.case_cost / r.units_per_case, 4),
        case when l.unit_cost > 0
          then round((round(r.case_cost / r.units_per_case, 4) - l.unit_cost) / l.unit_cost * 100, 2)
        end,
        'import'
      from pg_temp.import_rows r
      left join latest l on l.supplier_product_id = r.supplier_product_id
      where r.error is null and r.case_cost is not null
        and (l.case_cost is distinct from r.case_cost
             or l.unit_cost is distinct from round(r.case_cost / r.units_per_case, 4))
      returning change_pct
    )
    select count(*), count(*) filter (where change_pct > 0)
    into v_costs, v_increases
    from added;

    select jsonb_build_object(
      'rows', count(*) + p_rows_skipped,
      'valid', count(*) filter (where error is null),
      'skipped', p_rows_skipped,
      'new_links', count(*) filter (where is_new),
      'updated_links', count(*) filter (where changed),
      'unchanged_links', count(*) filter (where error is null and not is_new and not changed),
      'costs_recorded', v_costs,
      'price_increases', v_increases,
      'errors', coalesce(
        jsonb_agg(jsonb_build_object('row', row_number, 'message', error) order by row_number)
          filter (where error is not null),
        '[]'::jsonb)
    )
    into v_result
    from pg_temp.import_rows;

    if p_dry_run then
      raise sqlstate 'DRY01';
    end if;

    insert into public.imports
      (import_type, supplier_id, file_name, file_fingerprint, column_mapping,
       rows_total, rows_ok, rows_error, summary)
    values (
      'supplier_products', p_supplier_id, p_file_name, p_fingerprint,
      coalesce(p_mapping, '{}'), (v_result ->> 'rows')::integer, v_valid,
      p_rows_skipped, v_result - 'errors'
    )
    returning id into v_import_id;

    v_result := v_result || jsonb_build_object('import_id', v_import_id);
  exception
    when sqlstate 'DRY01' then
      null; -- Preview only: everything above is undone, the summary is kept.
  end;

  return v_result;
end;
$$;
