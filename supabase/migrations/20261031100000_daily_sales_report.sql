-- Daily till sales for the dashboard chart: one row per day for the last
-- p_days days up to yesterday, with what was sold and whether that day's
-- sales are in (imported), the shop was shut (closed), or not yet (missing).

create index if not exists sales_import_lines_day_idx
  on public.sales_import_lines (store_id, sale_date);

create function public.report_daily_sales(p_days integer default 14)
returns table (day date, gross_sales numeric, items_sold numeric, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_end date := (now() at time zone 'Europe/London')::date - 1;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 92);
begin
  perform private.report_check();
  return query
  with days as (
    select g::date as d
    from generate_series(v_end - (v_days - 1), v_end, interval '1 day') g
  ),
  sold as (
    select l.sale_date, sum(l.gross_value) as gross, sum(l.stock_quantity) as items
    from public.sales_import_lines l
    join public.imports i on i.id = l.import_id and i.status = 'committed'
    where l.store_id = v_store and l.sale_date between v_end - (v_days - 1) and v_end
    group by l.sale_date
  )
  select
    days.d,
    coalesce(sold.gross, 0),
    coalesce(sold.items, 0),
    case
      when exists (
        select 1 from public.imports i
        where i.import_type = 'sales' and i.status = 'committed' and i.store_id = v_store
          and days.d between i.period_start and i.period_end
      ) then 'imported'
      when exists (
        select 1 from public.store_closed_days c
        where c.store_id = v_store and c.day = days.d
      ) then 'closed'
      else 'missing'
    end
  from days
  left join sold on sold.sale_date = days.d
  order by days.d;
end;
$$;

revoke execute on function public.report_daily_sales(integer) from public, anon;
grant execute on function public.report_daily_sales(integer) to authenticated;
