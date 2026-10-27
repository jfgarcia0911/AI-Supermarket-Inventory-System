-- Which days need sales was worked out from the earliest opening stock count
-- of any product, so one switched-off product counted long ago (such as a
-- test product) made every day since then look "missing". Only products
-- that are switched on count now.

create or replace function private.missing_sales_days(p_store_id uuid, p_through date) returns date[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day_end time;
  v_first_count timestamptz;
  v_needed_from date;
  v_first_import date;
  v_start date;
  v_missing date[];
begin
  select trading_day_end into v_day_end from public.stores where id = p_store_id;
  select min(m.occurred_at) into v_first_count
  from public.stock_movements m
  join public.products p on p.id = m.product_id and p.active
  where m.store_id = p_store_id and m.movement_type = 'opening_balance';
  if v_first_count is not null then
    v_needed_from := (v_first_count at time zone 'Europe/London')::date
      + case when (v_first_count at time zone 'Europe/London')::time >= v_day_end then 1 else 0 end;
  end if;
  select min(period_start) into v_first_import
  from public.imports
  where import_type = 'sales' and status = 'committed' and store_id = p_store_id;

  v_start := least(v_needed_from, v_first_import);
  if v_start is null or v_start > p_through then
    return '{}';
  end if;
  v_start := greatest(v_start, p_through - 366);

  select coalesce(array_agg(d::date order by d), '{}') into v_missing
  from generate_series(v_start, p_through, interval '1 day') d
  where not exists (
    select 1 from public.imports i
    where i.import_type = 'sales' and i.status = 'committed' and i.store_id = p_store_id
      and d::date between i.period_start and i.period_end
  )
  and not exists (
    select 1 from public.store_closed_days c
    where c.store_id = p_store_id and c.day = d::date
  );
  return v_missing;
end;
$$;

create or replace function public.sales_coverage() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_through date := (now() at time zone 'Europe/London')::date - 1;
  v_missing date[];
  v_first_count timestamptz;
  v_day_end time;
  v_needed_from date;
  v_first_import date;
  v_last_import date;
  v_unmatched_lines integer;
  v_unmatched_codes integer;
begin
  if not private.is_active_user() then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  v_missing := private.missing_sales_days(v_store, v_through);

  select trading_day_end into v_day_end from public.stores where id = v_store;
  select min(m.occurred_at) into v_first_count
  from public.stock_movements m
  join public.products p on p.id = m.product_id and p.active
  where m.store_id = v_store and m.movement_type = 'opening_balance';
  if v_first_count is not null then
    v_needed_from := (v_first_count at time zone 'Europe/London')::date
      + case when (v_first_count at time zone 'Europe/London')::time >= v_day_end then 1 else 0 end;
  end if;
  select min(period_start), max(period_end) into v_first_import, v_last_import
  from public.imports
  where import_type = 'sales' and status = 'committed' and store_id = v_store;

  select count(*), count(distinct upper(l.code)) into v_unmatched_lines, v_unmatched_codes
  from public.sales_import_lines l
  join public.imports i on i.id = l.import_id and i.status = 'committed'
  where l.store_id = v_store and l.status = 'unmatched';

  return jsonb_build_object(
    'needed_from', least(v_needed_from, v_first_import),
    'imported_through', v_last_import,
    'expected_through', v_through,
    'missing_count', coalesce(cardinality(v_missing), 0),
    'missing_days', to_jsonb(v_missing[1:31]),
    'unmatched_lines', v_unmatched_lines,
    'unmatched_codes', v_unmatched_codes
  );
end;
$$;
