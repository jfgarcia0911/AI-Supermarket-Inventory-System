-- Previewing a file that was already imported failed with a database error
-- instead of saying so: the preview still tried the import, which clashed
-- with the earlier one. A file that cannot be imported is no longer tried.

create or replace function public.import_sales(
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

  -- Nothing to try out: no valid rows, or the file cannot be imported anyway.
  if v_start is null or v_blocked is not null then
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
