-- Phase 3: daily till sales.
--
-- The till exports one CSV a day. Each line becomes a sale (or, for a negative
-- quantity, a refund) movement dated at the end of that trading day. Lines
-- whose code matches no product are kept as "unmatched" so they can be matched
-- later; they are never dropped. The same file, or a period that overlaps one
-- already imported, cannot be imported twice. An owner can reverse an import.

create type public.sales_line_status as enum ('matched', 'unmatched', 'ignored');

-- ---------------------------------------------------------------------------
-- Codes the importer should always treat a certain way: link to a product,
-- or ignore (carrier bags, open-price keys). Checked before barcodes.
-- ---------------------------------------------------------------------------

create table public.sales_code_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(code) between 1 and 40),
  -- Empty means "ignore this code".
  product_id uuid references public.products (id),
  description text check (length(description) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);

create trigger sales_code_rules_audit after insert or update or delete on public.sales_code_rules
for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- One row per line of an imported sales file.
-- ---------------------------------------------------------------------------

create table public.sales_import_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id),
  store_id uuid not null references public.stores (id),
  row_number integer not null check (row_number > 0),
  sale_date date not null,
  code text not null check (length(code) between 1 and 40),
  description text check (length(description) <= 200),
  -- As in the file: + sold, − refunded. Single items, or kg.
  quantity numeric(12, 3) not null check (quantity <> 0),
  -- What it does to stock (a case barcode sold at the till counts its units).
  stock_quantity numeric(12, 3),
  net_value numeric(12, 4),
  gross_value numeric(12, 4),
  product_id uuid references public.products (id),
  status public.sales_line_status not null,
  movement_id uuid references public.stock_movements (id),
  note text check (length(note) <= 300),
  matched_by uuid references public.profiles (id),
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

create index sales_import_lines_import_idx on public.sales_import_lines (import_id, row_number);
create index sales_import_lines_unmatched_idx on public.sales_import_lines (upper(code))
  where status = 'unmatched';
create index sales_import_lines_product_idx on public.sales_import_lines (product_id, sale_date);

create index imports_sales_period_idx on public.imports (store_id, period_start, period_end)
  where import_type = 'sales' and status = 'committed';

insert into public.settings (key, value, description) values
  ('sales_file_format', '{}',
   'The heading of each column in the till''s sales export, remembered from the last import.');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- When a day's sales are dated: the end of that trading day, UK time.
create function private.sales_moment(p_store_id uuid, p_sale_date date) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_sale_date + s.trading_day_end) at time zone 'Europe/London')
  from public.stores s where s.id = p_store_id;
$$;

create function private.average_cost(p_store_id uuid, p_product_id uuid) returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select average_unit_cost from public.stock_costs
  where store_id = p_store_id and product_id = p_product_id;
$$;

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------

-- p_rows: [{row_number, sale_date (yyyy-mm-dd), code, description, quantity,
-- net_value, gross_value}]. Preview (p_dry_run) and real run share one path.
create function public.import_sales(
  p_rows jsonb,
  p_file_name text,
  p_fingerprint text,
  p_mapping jsonb default '{}',
  p_rows_skipped integer default 0,
  p_column_headers jsonb default null,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_start date;
  v_end date;
  v_blocked text;
  v_other public.imports;
  v_import_id uuid;
  v_line record;
  v_movement uuid;
  v_result jsonb;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can import sales.' using errcode = '42501';
  end if;
  if v_store is null then
    raise exception 'Set up the shop first.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'A file can have at most 20,000 rows. Split it into smaller files.';
  end if;
  if p_file_name is null or p_fingerprint is null then
    raise exception 'The file name and fingerprint are missing.';
  end if;

  -- One sales import at a time, so two people cannot import the same day.
  if not p_dry_run then
    perform 1 from public.stores where id = v_store for update;
  end if;

  drop table if exists pg_temp.sales_rows;
  create temporary table sales_rows on commit drop as
  select
    r.row_number,
    r.sale_date,
    nullif(btrim(r.code), '') as code,
    nullif(btrim(r.description), '') as description,
    r.quantity,
    r.net_value,
    r.gross_value,
    null::uuid as product_id,
    1::numeric as units_per_pack,
    null::public.sales_line_status as status,
    null::text as note,
    null::timestamptz as sold_at,
    null::text as error
  from jsonb_to_recordset(p_rows) as r (
    row_number integer, sale_date date, code text, description text,
    quantity numeric, net_value numeric, gross_value numeric
  );

  update pg_temp.sales_rows set error = 'The date is missing.' where sale_date is null;
  update pg_temp.sales_rows set error = format('%s is in the future.', to_char(sale_date, 'FMDD Mon YYYY'))
  where error is null and sale_date > v_today;
  update pg_temp.sales_rows set error = 'The item code is missing.' where error is null and code is null;
  update pg_temp.sales_rows set error = 'The item code is longer than 40 characters.'
  where error is null and length(code) > 40;
  update pg_temp.sales_rows set error = 'The quantity sold is missing.'
  where error is null and (quantity is null or quantity = 0);
  update pg_temp.sales_rows set error = 'The quantity sold is too large.'
  where error is null and abs(quantity) > 100000;
  update pg_temp.sales_rows set description = left(description, 200) where error is null;
  update pg_temp.sales_rows set sold_at = private.sales_moment(v_store, sale_date) where error is null;

  -- 1. Codes with a rule: a chosen product, or ignore.
  update pg_temp.sales_rows r
  set product_id = ru.product_id,
      status = case when ru.product_id is null then 'ignored' else 'matched' end::public.sales_line_status,
      note = case when ru.product_id is null then 'Ignored: this code is set to be ignored.' end
  from public.sales_code_rules ru
  where r.error is null and ru.code = upper(r.code);

  -- 2. Barcodes (unit or case), ignoring lost leading zeros.
  update pg_temp.sales_rows r
  set product_id = b.product_id, units_per_pack = b.units_per_pack, status = 'matched'
  from (
    select distinct on (lpad(b.barcode, 14, '0'))
      lpad(b.barcode, 14, '0') as key, b.product_id, b.units_per_pack
    from public.product_barcodes b
    join public.products p on p.id = b.product_id
    where b.active
    order by lpad(b.barcode, 14, '0'), p.active desc
  ) b
  where r.error is null and r.status is null
    and r.code ~ '^[0-9]{8,14}$' and lpad(r.code, 14, '0') = b.key;

  -- 3. Till codes.
  update pg_temp.sales_rows r
  set product_id = p.id, status = 'matched'
  from (
    select distinct on (till_code) till_code, id
    from public.products
    where till_code is not null
    order by till_code, active desc
  ) p
  where r.error is null and r.status is null and p.till_code = upper(r.code);

  update pg_temp.sales_rows set status = 'unmatched' where error is null and status is null;

  -- A product's stock count already includes everything sold before it.
  update pg_temp.sales_rows r
  set error = format(
    'Sales on %s are already in this product''s stock count of %s.',
    to_char(r.sale_date, 'FMDD Mon YYYY'),
    to_char(l.last_counted_at at time zone 'Europe/London', 'FMDD Mon YYYY'))
  from public.stock_levels l
  where r.error is null and r.status = 'matched'
    and l.store_id = v_store and l.product_id = r.product_id and l.last_counted_at >= r.sold_at;

  select min(sale_date), max(sale_date) into v_start, v_end
  from pg_temp.sales_rows where error is null;

  -- Whole-file checks.
  select * into v_other from public.imports
  where import_type = 'sales' and status = 'committed' and file_fingerprint = p_fingerprint
  limit 1;
  if found then
    v_blocked := format('This file was already imported on %s.',
      to_char(v_other.committed_at at time zone 'Europe/London', 'FMDD Mon YYYY'));
  elsif v_start is not null then
    select * into v_other from public.imports
    where import_type = 'sales' and status = 'committed' and store_id = v_store
      and period_start <= v_end and period_end >= v_start
    order by period_start
    limit 1;
    if found then
      v_blocked := format(
        'Sales for %s were already imported from %s. Each day can only be imported once.',
        case when v_other.period_start = v_other.period_end
          then to_char(v_other.period_start, 'FMDD Mon YYYY')
          else to_char(v_other.period_start, 'FMDD Mon') || ' to ' || to_char(v_other.period_end, 'FMDD Mon YYYY')
        end,
        v_other.file_name);
    end if;
  end if;

  select jsonb_build_object(
    'rows', count(*) + p_rows_skipped,
    'valid', count(*) filter (where error is null),
    'skipped', p_rows_skipped,
    'blocked', v_blocked,
    'period_start', v_start,
    'period_end', v_end,
    'days', count(distinct sale_date) filter (where error is null),
    'matched', count(*) filter (where error is null and status = 'matched'),
    'unmatched', count(*) filter (where error is null and status = 'unmatched'),
    'ignored', count(*) filter (where error is null and status = 'ignored'),
    'refunds', count(*) filter (where error is null and quantity < 0),
    'units_sold', coalesce(sum(quantity * units_per_pack) filter (where error is null and status = 'matched'), 0),
    'gross_sales', coalesce(sum(gross_value) filter (where error is null), 0),
    'errors', coalesce(
      jsonb_agg(jsonb_build_object('row', row_number, 'message', error) order by row_number)
        filter (where error is not null),
      '[]'::jsonb)
  )
  into v_result
  from pg_temp.sales_rows;

  if not p_dry_run then
    if v_blocked is not null then
      raise exception '%', v_blocked;
    end if;
    if jsonb_array_length(v_result -> 'errors') > 0 then
      raise exception 'The file now has % row(s) with problems. Check it again before importing.',
        jsonb_array_length(v_result -> 'errors');
    end if;
    if (v_result ->> 'valid')::integer = 0 then
      raise exception 'There is nothing to import.';
    end if;
  end if;

  if v_start is null then
    return v_result;
  end if;

  begin
    insert into public.imports (
      import_type, store_id, file_name, file_fingerprint, period_start, period_end,
      column_mapping, rows_total, rows_ok, rows_error, rows_unmatched
    )
    values (
      'sales', v_store, left(p_file_name, 255), p_fingerprint, v_start, v_end,
      coalesce(p_mapping, '{}'),
      (v_result ->> 'rows')::integer, (v_result ->> 'valid')::integer,
      jsonb_array_length(v_result -> 'errors') + p_rows_skipped,
      (v_result ->> 'unmatched')::integer
    )
    returning id into v_import_id;

    insert into public.sales_import_lines (
      import_id, store_id, row_number, sale_date, code, description, quantity,
      stock_quantity, net_value, gross_value, product_id, status, note
    )
    select
      v_import_id, v_store, row_number, sale_date, code, description, quantity,
      case when status = 'matched' then round(quantity * units_per_pack, 3) end,
      net_value, gross_value, product_id, status, note
    from pg_temp.sales_rows
    where error is null;

    for v_line in
      select l.id, l.product_id, l.stock_quantity, l.sale_date
      from public.sales_import_lines l
      where l.import_id = v_import_id and l.status = 'matched'
      order by l.row_number
    loop
      v_movement := private.apply_movement(
        v_store, v_line.product_id,
        case when v_line.stock_quantity > 0 then 'sale' else 'refund' end::public.movement_type,
        -v_line.stock_quantity,
        private.average_cost(v_store, v_line.product_id),
        private.sales_moment(v_store, v_line.sale_date),
        'sales_line', v_line.id);
      update public.sales_import_lines set movement_id = v_movement where id = v_line.id;
    end loop;

    if p_dry_run then
      raise sqlstate 'DRY01';
    end if;

    update public.imports set summary = v_result - 'errors' - 'blocked' where id = v_import_id;
    if p_column_headers is not null and jsonb_typeof(p_column_headers) = 'object' then
      update public.settings set value = p_column_headers where key = 'sales_file_format';
    end if;
    v_result := v_result || jsonb_build_object('import_id', v_import_id);
  exception
    when sqlstate 'DRY01' then
      null; -- Preview only: everything above is undone, the summary is kept.
  end;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Unmatched lines
-- ---------------------------------------------------------------------------

-- Links every unmatched line with this code to a product and writes the
-- movements, dated at the original sale date. With p_remember, future imports
-- match the code too: as a barcode of the product when it is a valid unused
-- barcode, otherwise as a rule.
create function public.match_sales_code(
  p_code text,
  p_product_id uuid,
  p_remember boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_code text := upper(btrim(p_code));
  v_line record;
  v_sold_at timestamptz;
  v_counted_at timestamptz;
  v_movement uuid;
  v_matched integer := 0;
  v_counted integer := 0;
  v_units numeric := 0;
  v_remembered text;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can match sales lines.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and active) then
    raise exception 'Choose an active product.';
  end if;

  for v_line in
    select l.id, l.sale_date, l.quantity
    from public.sales_import_lines l
    join public.imports i on i.id = l.import_id and i.status = 'committed'
    where l.store_id = v_store and l.status = 'unmatched' and upper(l.code) = v_code
    order by l.sale_date, l.row_number
    for update of l
  loop
    v_sold_at := private.sales_moment(v_store, v_line.sale_date);
    select last_counted_at into v_counted_at from public.stock_levels
    where store_id = v_store and product_id = p_product_id;

    if v_counted_at >= v_sold_at then
      update public.sales_import_lines set
        status = 'ignored', product_id = p_product_id,
        note = format('Already in the stock count of %s.',
          to_char(v_counted_at at time zone 'Europe/London', 'FMDD Mon YYYY')),
        matched_by = auth.uid(), matched_at = now()
      where id = v_line.id;
      v_counted := v_counted + 1;
    else
      v_movement := private.apply_movement(
        v_store, p_product_id,
        case when v_line.quantity > 0 then 'sale' else 'refund' end::public.movement_type,
        -v_line.quantity, private.average_cost(v_store, p_product_id), v_sold_at,
        'sales_line', v_line.id);
      update public.sales_import_lines set
        status = 'matched', product_id = p_product_id, stock_quantity = quantity,
        movement_id = v_movement, matched_by = auth.uid(), matched_at = now()
      where id = v_line.id;
      v_matched := v_matched + 1;
      v_units := v_units + v_line.quantity;
    end if;
  end loop;

  if v_matched + v_counted = 0 then
    raise exception 'There are no unmatched sales lines with code %.', v_code;
  end if;

  if p_remember then
    if private.is_valid_gtin(v_code)
       and not exists (select 1 from public.product_barcodes where barcode = v_code and active) then
      insert into public.product_barcodes (product_id, barcode) values (p_product_id, v_code);
      v_remembered := 'barcode';
    else
      insert into public.sales_code_rules (code, product_id)
      values (v_code, p_product_id)
      on conflict (code) do update set product_id = excluded.product_id;
      v_remembered := 'rule';
    end if;
  end if;

  return jsonb_build_object(
    'matched', v_matched, 'already_counted', v_counted, 'units', v_units,
    'remembered', v_remembered);
end;
$$;

-- Marks every unmatched line with this code as ignored (no stock change).
-- With p_always, future imports ignore the code too.
create function public.ignore_sales_code(p_code text, p_always boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_code text := upper(btrim(p_code));
  v_count integer;
  v_description text;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can ignore sales lines.' using errcode = '42501';
  end if;
  if v_code is null or v_code = '' then
    raise exception 'The code is missing.';
  end if;

  select max(l.description) into v_description
  from public.sales_import_lines l where upper(l.code) = v_code;

  with changed as (
    update public.sales_import_lines l set
      status = 'ignored', note = 'Ignored by hand.', matched_by = auth.uid(), matched_at = now()
    from public.imports i
    where i.id = l.import_id and i.status = 'committed'
      and l.store_id = v_store and l.status = 'unmatched' and upper(l.code) = v_code
    returning l.id
  )
  select count(*) into v_count from changed;

  if p_always then
    insert into public.sales_code_rules (code, product_id, description)
    values (v_code, null, v_description)
    on conflict (code) do update set product_id = null, description = excluded.description;
  elsif v_count = 0 then
    raise exception 'There are no unmatched sales lines with code %.', v_code;
  end if;
  return v_count;
end;
$$;

-- Stops treating a code specially. Lines already matched or ignored stay as they are.
create function public.forget_sales_code_rule(p_code text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can change sales code rules.' using errcode = '42501';
  end if;
  delete from public.sales_code_rules where code = upper(btrim(p_code));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reversing an import (owners): every movement it made is reversed, dated
-- like the original, and its days can be imported again.
-- ---------------------------------------------------------------------------

create function public.reverse_sales_import(p_import_id uuid, p_reason text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_reason text := nullif(btrim(p_reason), '');
  v_line record;
  v_count integer := 0;
begin
  if not private.has_role('owner') then
    raise exception 'Only owners can reverse a sales import.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Say why the import is being reversed.';
  end if;
  select * into v_import from public.imports where id = p_import_id for update;
  if not found or v_import.import_type <> 'sales' then
    raise exception 'That sales import does not exist.';
  end if;
  if v_import.status <> 'committed' then
    raise exception 'This sales import was already reversed.';
  end if;

  for v_line in
    select movement_id from public.sales_import_lines
    where import_id = p_import_id and movement_id is not null
    order by row_number
  loop
    if private.reverse_movement(v_line.movement_id, left('Sales import reversed: ' || v_reason, 500)) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  update public.imports set
    status = 'reversed',
    summary = summary || jsonb_build_object(
      'reversed_at', now(), 'reversed_by', auth.uid(), 'reversed_reason', left(v_reason, 300))
  where id = p_import_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which days' sales are missing. Sales are needed for every day from the
-- first opening stock count (or the first sales import) up to yesterday.
-- ---------------------------------------------------------------------------

create function public.sales_coverage() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_day_end time;
  v_through date := (now() at time zone 'Europe/London')::date - 1;
  v_first_count timestamptz;
  v_needed_from date;
  v_first_import date;
  v_last_import date;
  v_start date;
  v_missing date[];
  v_unmatched_lines integer;
  v_unmatched_codes integer;
begin
  if not private.is_active_user() then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select trading_day_end into v_day_end from public.stores where id = v_store;
  select min(occurred_at) into v_first_count
  from public.stock_movements where store_id = v_store and movement_type = 'opening_balance';
  if v_first_count is not null then
    v_needed_from := (v_first_count at time zone 'Europe/London')::date
      + case when (v_first_count at time zone 'Europe/London')::time >= v_day_end then 1 else 0 end;
  end if;

  select min(period_start), max(period_end) into v_first_import, v_last_import
  from public.imports
  where import_type = 'sales' and status = 'committed' and store_id = v_store;

  v_start := least(v_needed_from, v_first_import);
  if v_start is not null and v_start <= v_through then
    v_start := greatest(v_start, v_through - 366);
    select coalesce(array_agg(d::date order by d), '{}') into v_missing
    from generate_series(v_start, v_through, interval '1 day') d
    where not exists (
      select 1 from public.imports i
      where i.import_type = 'sales' and i.status = 'committed' and i.store_id = v_store
        and d::date between i.period_start and i.period_end
    );
  else
    v_missing := '{}';
  end if;

  select count(*), count(distinct upper(l.code)) into v_unmatched_lines, v_unmatched_codes
  from public.sales_import_lines l
  join public.imports i on i.id = l.import_id and i.status = 'committed'
  where l.store_id = v_store and l.status = 'unmatched';

  return jsonb_build_object(
    'needed_from', v_start,
    'imported_through', v_last_import,
    'expected_through', v_through,
    'missing_count', coalesce(cardinality(v_missing), 0),
    'missing_days', to_jsonb(v_missing[1:31]),
    'unmatched_lines', v_unmatched_lines,
    'unmatched_codes', v_unmatched_codes
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Views for the Sales screens (read as the signed-in user).
-- ---------------------------------------------------------------------------

create view public.sales_import_overview
with (security_invoker = true)
as
select
  i.id,
  i.store_id,
  i.file_name,
  i.period_start,
  i.period_end,
  i.status,
  i.committed_at,
  i.committed_by,
  i.rows_error,
  i.summary,
  count(l.id)::integer as line_count,
  (count(l.id) filter (where l.status = 'matched'))::integer as matched_count,
  (count(l.id) filter (where l.status = 'unmatched'))::integer as unmatched_count,
  (count(l.id) filter (where l.status = 'ignored'))::integer as ignored_count,
  coalesce(sum(l.stock_quantity) filter (where l.status = 'matched'), 0) as units_sold,
  coalesce(sum(l.gross_value), 0) as gross_sales
from public.imports i
left join public.sales_import_lines l on l.import_id = i.id
where i.import_type = 'sales'
group by i.id;

create view public.sales_unmatched_codes
with (security_invoker = true)
as
select
  upper(l.code) as code,
  max(l.description) as description,
  count(*)::integer as line_count,
  sum(l.quantity) as quantity,
  sum(l.gross_value) as gross_value,
  min(l.sale_date) as first_sale_date,
  max(l.sale_date) as last_sale_date
from public.sales_import_lines l
join public.imports i on i.id = l.import_id and i.status = 'committed'
where l.status = 'unmatched'
group by upper(l.code);

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

alter table public.sales_import_lines enable row level security;
alter table public.sales_code_rules enable row level security;

create policy "Owners, managers and viewers can read sales lines"
on public.sales_import_lines for select to authenticated
using ((select private.has_role('owner', 'manager', 'viewer')));

create policy "Owners, managers and viewers can read sales code rules"
on public.sales_code_rules for select to authenticated
using ((select private.has_role('owner', 'manager', 'viewer')));

-- Only the functions above write these.
revoke insert, update, delete, truncate, references, trigger
  on public.sales_import_lines, public.sales_code_rules from authenticated;
revoke all on public.sales_import_lines, public.sales_code_rules from anon;

revoke execute on function
  private.sales_moment(uuid, date),
  private.average_cost(uuid, uuid)
from public, anon, authenticated;

revoke execute on function
  public.import_sales(jsonb, text, text, jsonb, integer, jsonb, boolean),
  public.match_sales_code(text, uuid, boolean),
  public.ignore_sales_code(text, boolean),
  public.forget_sales_code_rule(text),
  public.reverse_sales_import(uuid, text),
  public.sales_coverage()
from public, anon;

grant execute on function
  public.import_sales(jsonb, text, text, jsonb, integer, jsonb, boolean),
  public.match_sales_code(text, uuid, boolean),
  public.ignore_sales_code(text, boolean),
  public.forget_sales_code_rule(text),
  public.reverse_sales_import(uuid, text),
  public.sales_coverage()
to authenticated;
