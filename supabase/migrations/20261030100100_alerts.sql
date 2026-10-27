-- Phase 4: in-app alerts.
--
-- Alerts are worked out from the state of the shop by private.refresh_alerts:
-- each problem found opens an alert (or updates the open one), and alerts
-- whose problem has gone are resolved automatically. There is only one
-- unresolved alert per type and subject (a product, a count, a barcode or
-- the shop as a whole). People acknowledge an alert to say they have seen it.

create type public.alert_type as enum (
  'low_stock', 'negative_stock', 'unmatched_sales', 'sales_import_missing',
  'unposted_delivery', 'count_needs_recount', 'pending_approval', 'ledger_mismatch',
  'unknown_barcode'
);
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  type public.alert_type not null,
  -- What it is about: a product id, count id or barcode; '' for the whole shop.
  subject text not null default '',
  product_id uuid references public.products (id),
  severity public.alert_severity not null,
  status public.alert_status not null default 'open',
  message text not null check (length(message) <= 500),
  link text check (length(link) <= 200),
  details jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id),
  resolved_at timestamptz,
  -- Empty when it was resolved automatically.
  resolved_by uuid references public.profiles (id)
);

create unique index alerts_unresolved_key on public.alerts (store_id, type, subject)
  where status <> 'resolved';
create index alerts_status_idx on public.alerts (status, severity, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- Working out the alerts
-- ---------------------------------------------------------------------------

-- How many counted products in a count differ from the ledger by more than
-- the recount limits (the same rule as count_review's "flagged").
create function private.count_flagged_products(p_count_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.stock_counts where id = p_count_id),
  counted as (
    select l.product_id, sum(l.counted_qty) as total
    from public.stock_count_lines l where l.count_id = p_count_id
    group by l.product_id
  ),
  diffs as (
    select
      abs(counted.total - private.stock_balance_as_of(c.store_id, counted.product_id, c.as_of)) as diff,
      coalesce(sc.average_unit_cost, 0) as cost
    from counted
    cross join c
    left join public.stock_costs sc on sc.store_id = c.store_id and sc.product_id = counted.product_id
  )
  select count(*)::integer from diffs
  where diff > coalesce(private.setting_number('recount_units'), 20)
     or diff * cost > coalesce(private.setting_number('recount_value'), 25);
$$;

create function private.refresh_alerts(p_store_id uuid) returns void
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
        format('%s: %s %s differ by more than the recount limit.', v_count.name, v_flagged,
          case when v_flagged = 1 then 'product' else 'products' end),
        '/counts/' || v_count.id, jsonb_build_object('products', v_flagged));
    end if;
  end loop;

  -- Waiting for a manager.
  insert into pg_temp.current_alerts
  select 'pending_approval', '', null, 'info',
    concat_ws(' and ',
      case when a.n > 0 then format('%s %s', a.n, case when a.n = 1 then 'adjustment' else 'adjustments' end) end,
      case when c.n > 0 then format('%s %s', c.n, case when c.n = 1 then 'count' else 'counts' end) end
    ) || ' waiting for a manager.',
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

-- Brings the alerts up to date. Called when the dashboard or Alerts page
-- opens, so they always show the current state.
create function public.refresh_alerts() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
begin
  if not private.is_active_user() then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if v_store is not null then
    perform private.refresh_alerts(v_store);
  end if;
  return (
    select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'critical', count(*) filter (where severity = 'critical'),
      'warning', count(*) filter (where severity = 'warning'))
    from public.alerts
    where store_id = v_store and status <> 'resolved'
  );
end;
$$;

-- Staff who scan a barcode no product has can tell a manager.
create function public.report_unknown_barcode(p_code text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to report barcodes.' using errcode = '42501';
  end if;
  if v_code = '' or length(v_code) > 40 then
    raise exception 'The barcode is missing.';
  end if;
  if exists (select 1 from public.product_barcodes where barcode = v_code and active) then
    raise exception 'A product already has barcode %.', v_code;
  end if;

  insert into public.alerts (store_id, type, subject, severity, message, link, details)
  values (
    v_store, 'unknown_barcode', v_code, 'warning',
    format('Someone scanned %s, which no product has. Add it to a product, or add a new product.', v_code),
    '/scan?code=' || v_code, jsonb_build_object('reported_by', auth.uid()))
  on conflict (store_id, type, subject) where status <> 'resolved'
  do update set last_seen_at = now(), status = 'open';
end;
$$;

create function public.acknowledge_alert(p_alert_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to change alerts.' using errcode = '42501';
  end if;
  update public.alerts
  set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid()
  where id = p_alert_id and status = 'open'
    and (private.has_role('owner', 'manager')
         or type in ('low_stock', 'negative_stock', 'unposted_delivery', 'unknown_barcode'));
  if not found then
    raise exception 'That alert is not open.';
  end if;
end;
$$;

-- Owners and managers can close an alert by hand. Automatic alerts open
-- again on the next check if the problem is still there.
create function public.resolve_alert(p_alert_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can close alerts.' using errcode = '42501';
  end if;
  update public.alerts
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_alert_id and status <> 'resolved';
  if not found then
    raise exception 'That alert is already closed.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

alter table public.alerts enable row level security;

-- Stock staff see the alerts about stock on the shelves; the rest are for
-- owners, managers and viewers.
create policy "People can read the alerts meant for them"
on public.alerts for select to authenticated
using (
  (select private.has_role('owner', 'manager', 'viewer'))
  or (
    (select private.is_active_user())
    and type in ('low_stock', 'negative_stock', 'unposted_delivery', 'unknown_barcode')
  )
);

revoke insert, update, delete, truncate, references, trigger on public.alerts from authenticated;
revoke all on public.alerts from anon;

revoke execute on function
  private.refresh_alerts(uuid),
  private.count_flagged_products(uuid)
from public, anon, authenticated;

revoke execute on function
  public.refresh_alerts(),
  public.report_unknown_barcode(text),
  public.acknowledge_alert(uuid),
  public.resolve_alert(uuid)
from public, anon;

grant execute on function
  public.refresh_alerts(),
  public.report_unknown_barcode(text),
  public.acknowledge_alert(uuid),
  public.resolve_alert(uuid)
to authenticated;
