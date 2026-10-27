-- Alert wording: "1 product differs" (not "differ"), and "is/are waiting".

create or replace function private.refresh_alerts(p_store_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing date[];
  v_hours numeric := coalesce(private.setting_number('unposted_delivery_hours'), 24);
  v_count record;
  v_flagged integer;
begin
  drop table if exists pg_temp.current_alerts;
  create temporary table current_alerts (
    type public.alert_type,
    subject text,
    product_id uuid,
    severity public.alert_severity,
    message text,
    link text,
    details jsonb
  ) on commit drop;

  -- Stock below zero, and low stock (counted products only).
  insert into pg_temp.current_alerts
  select
    case when l.quantity_on_hand < 0 then 'negative_stock' else 'low_stock' end::public.alert_type,
    p.id::text, p.id,
    case when l.quantity_on_hand < 0 then 'warning' else 'info' end::public.alert_severity,
    case when l.quantity_on_hand < 0
      then format('%s: stock is %s. Something was probably not recorded.',
        concat_ws(' ', p.name, p.size), trim_scale(l.quantity_on_hand))
      else format('%s: %s left, reorder at %s.',
        concat_ws(' ', p.name, p.size), trim_scale(l.quantity_on_hand), trim_scale(p.reorder_point))
    end,
    '/products/' || p.id,
    jsonb_build_object('quantity', l.quantity_on_hand, 'reorder_point', p.reorder_point)
  from public.products p
  join public.stock_levels l on l.product_id = p.id and l.store_id = p_store_id
  where p.active and (
    l.quantity_on_hand < 0
    or (l.last_counted_at is not null and p.reorder_point is not null
        and l.quantity_on_hand <= p.reorder_point)
  );

  -- Missing sales days, up to yesterday.
  v_missing := private.missing_sales_days(p_store_id, (now() at time zone 'Europe/London')::date - 1);
  if cardinality(v_missing) > 0 then
    insert into pg_temp.current_alerts values (
      'sales_import_missing', '', null, 'critical',
      case when cardinality(v_missing) = 1
        then format('Sales for %s have not been imported.', to_char(v_missing[1], 'FMDD Mon YYYY'))
        else format('Sales for %s days have not been imported, starting %s.',
          cardinality(v_missing), to_char(v_missing[1], 'FMDD Mon YYYY'))
      end,
      '/sales', jsonb_build_object('days', to_jsonb(v_missing[1:31])));
  end if;

  -- Unmatched till lines.
  insert into pg_temp.current_alerts
  select 'unmatched_sales', '', null, 'warning',
    format('%s till lines (%s codes) do not match a product, so they have not come off stock.',
      count(*), count(distinct upper(l.code))),
    '/sales/unmatched', jsonb_build_object('lines', count(*))
  from public.sales_import_lines l
  join public.imports i on i.id = l.import_id and i.status = 'committed'
  where l.store_id = p_store_id and l.status = 'unmatched'
  having count(*) > 0;

  -- Deliveries checked in too long ago and still not posted.
  insert into pg_temp.current_alerts
  select 'unposted_delivery', '', null, 'warning',
    format('%s %s checked in more than %s hours ago %s not posted yet.',
      count(*), case when count(*) = 1 then 'delivery' else 'deliveries' end,
      trim_scale(v_hours), case when count(*) = 1 then 'is' else 'are' end),
    '/deliveries', jsonb_build_object('deliveries', jsonb_agg(i.id))
  from public.supplier_invoices i
  where i.store_id = p_store_id and i.status = 'checked_in'
    and i.checked_in_at < now() - make_interval(secs => v_hours * 3600)
  having count(*) > 0;

  -- Finished counts with differences over the recount limit.
  for v_count in
    select c.id, c.name from public.stock_counts c
    where c.store_id = p_store_id and c.status = 'submitted'
  loop
    v_flagged := private.count_flagged_products(v_count.id);
    if v_flagged > 0 then
      insert into pg_temp.current_alerts values (
        'count_needs_recount', v_count.id::text, null, 'warning',
        format('%s: %s by more than the recount limit.', v_count.name,
          case when v_flagged = 1 then '1 product differs'
            else v_flagged || ' products differ' end),
        '/counts/' || v_count.id, jsonb_build_object('products', v_flagged));
    end if;
  end loop;

  -- Waiting for a manager.
  insert into pg_temp.current_alerts
  select 'pending_approval', '', null, 'info',
    concat_ws(' and ',
      case when a.n > 0 then format('%s %s', a.n, case when a.n = 1 then 'adjustment' else 'adjustments' end) end,
      case when c.n > 0 then format('%s %s', c.n, case when c.n = 1 then 'count' else 'counts' end) end
    ) || case when a.n + c.n = 1 then ' is' else ' are' end || ' waiting for a manager.',
    case when a.n > 0 then '/adjustments' else '/counts' end,
    jsonb_build_object('adjustments', a.n, 'counts', c.n)
  from (select count(*) as n from public.stock_adjustments
        where store_id = p_store_id and status = 'pending') a,
       (select count(*) as n from public.stock_counts
        where store_id = p_store_id and status = 'submitted') c
  where a.n + c.n > 0;

  -- The ledger and the stock levels disagree (should never happen).
  insert into pg_temp.current_alerts
  select 'ledger_mismatch', '', null, 'critical',
    format('%s %s do not match their stock history. Tell whoever looks after the system.',
      count(*), case when count(*) = 1 then 'product''s stock levels' else 'products'' stock levels' end),
    '/stock', jsonb_build_object('products', jsonb_agg(m.product_id))
  from (
    select l.product_id
    from public.stock_levels l
    left join (
      select product_id, sum(quantity) as total from public.stock_movements
      where store_id = p_store_id group by product_id
    ) s on s.product_id = l.product_id
    where l.store_id = p_store_id and l.quantity_on_hand <> coalesce(s.total, 0)
  ) m
  having count(*) > 0;

  -- Update what is still a problem…
  update public.alerts a set
    severity = c.severity, message = c.message, link = c.link, details = c.details,
    product_id = c.product_id, last_seen_at = now()
  from pg_temp.current_alerts c
  where a.store_id = p_store_id and a.status <> 'resolved'
    and a.type = c.type and a.subject = c.subject;

  -- …open what is new…
  insert into public.alerts (store_id, type, subject, product_id, severity, message, link, details)
  select p_store_id, c.type, c.subject, c.product_id, c.severity, c.message, c.link, c.details
  from pg_temp.current_alerts c
  where not exists (
    select 1 from public.alerts a
    where a.store_id = p_store_id and a.status <> 'resolved'
      and a.type = c.type and a.subject = c.subject
  );

  -- …and resolve what has been fixed.
  update public.alerts a set status = 'resolved', resolved_at = now(), resolved_by = null
  where a.store_id = p_store_id and a.status <> 'resolved'
    and a.type <> 'unknown_barcode'
    and not exists (
      select 1 from pg_temp.current_alerts c where c.type = a.type and c.subject = a.subject
    );

  -- An unknown barcode is fixed once a product has it.
  update public.alerts a set status = 'resolved', resolved_at = now(), resolved_by = null
  where a.store_id = p_store_id and a.status <> 'resolved' and a.type = 'unknown_barcode'
    and exists (select 1 from public.product_barcodes b where b.barcode = a.subject and b.active);
end;
$$;
