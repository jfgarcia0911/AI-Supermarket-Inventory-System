-- Phase 4: basic reports. Each is worked out in the database (the Data API
-- returns at most 1,000 rows, so lists are added up here, not in the app).
-- Dates are UK calendar days, from and to inclusive. Money columns are empty
-- for anyone who may not see costs.

create function private.report_check() returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager', 'viewer') then
    raise exception 'Only owners, managers and viewers can see reports.' using errcode = '42501';
  end if;
end;
$$;

-- The start of a UK day as a moment.
create function private.london_day_start(p_day date) returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_day::timestamp at time zone 'Europe/London');
$$;

-- The top-level category ("department") of every category.
create function private.category_departments()
returns table (category_id uuid, department text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive tree (id, department, path) as (
    select c.id, c.name, c.name from public.categories c where c.parent_id is null
    union all
    select c.id, t.department, t.path || ' > ' || c.name
    from public.categories c join tree t on c.parent_id = t.id
  )
  select id, department, path from tree;
$$;

-- ---------------------------------------------------------------------------
-- Stock on hand and its value
-- ---------------------------------------------------------------------------

create function public.report_stock_by_department()
returns table (department text, products integer, units numeric, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  select
    d.department,
    count(*)::integer,
    coalesce(sum(greatest(l.quantity_on_hand, 0)), 0),
    case when v_costs then
      round(coalesce(sum(greatest(l.quantity_on_hand, 0) * sc.average_unit_cost), 0), 2)
    end
  from public.products p
  join private.category_departments() d on d.category_id = p.category_id
  left join public.stock_levels l on l.store_id = v_store and l.product_id = p.id
  left join public.stock_costs sc on sc.store_id = v_store and sc.product_id = p.id
  where p.active
  group by d.department
  order by d.department;
end;
$$;

create function public.report_stock_products()
returns table (
  department text, category text, product_name text, product_size text,
  sold_by public.sold_by, barcode text, on_hand numeric, reorder_point numeric,
  last_counted_at timestamptz, average_unit_cost numeric, value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  select
    d.department, d.path, p.name, p.size, p.sold_by,
    coalesce(
      (select b.barcode from public.product_barcodes b
       where b.product_id = p.id and b.active and b.pack_type = 'unit'
       order by b.is_primary desc, b.created_at limit 1),
      p.till_code),
    coalesce(l.quantity_on_hand, 0), p.reorder_point, l.last_counted_at,
    case when v_costs then sc.average_unit_cost end,
    case when v_costs then round(greatest(coalesce(l.quantity_on_hand, 0), 0) * sc.average_unit_cost, 2) end
  from public.products p
  join private.category_departments() d on d.category_id = p.category_id
  left join public.stock_levels l on l.store_id = v_store and l.product_id = p.id
  left join public.stock_costs sc on sc.store_id = v_store and sc.product_id = p.id
  where p.active
  order by d.path, p.name, p.size;
end;
$$;

-- ---------------------------------------------------------------------------
-- Movements over a period
-- ---------------------------------------------------------------------------

create function public.report_movement_totals(p_from date, p_to date)
returns table (movement_type public.movement_type, lines integer, quantity numeric, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  select
    m.movement_type, count(*)::integer, sum(m.quantity),
    case when v_costs then round(sum(m.quantity * coalesce(mc.unit_cost, 0)), 2) end
  from public.stock_movements m
  left join public.stock_movement_costs mc on mc.movement_id = m.id
  where m.store_id = v_store
    and m.occurred_at >= private.london_day_start(p_from)
    and m.occurred_at < private.london_day_start(p_to + 1)
  group by m.movement_type
  order by m.movement_type;
end;
$$;

-- Stock at the start and end of the period per product, and what moved it.
-- Opening + received + sold + adjusted + counted + reversed = closing.
create function public.report_movement_products(p_from date, p_to date)
returns table (
  department text, product_name text, product_size text, sold_by public.sold_by,
  opening numeric, received numeric, sold numeric, adjusted numeric,
  counted numeric, reversed numeric, closing numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_start timestamptz := private.london_day_start(p_from);
  v_end timestamptz := private.london_day_start(p_to + 1);
begin
  perform private.report_check();
  return query
  with sums as (
    select
      m.product_id,
      sum(m.quantity) filter (where m.occurred_at < v_start) as opening,
      sum(m.quantity) filter (where m.occurred_at >= v_start and m.movement_type in ('receipt', 'supplier_return')) as received,
      sum(m.quantity) filter (where m.occurred_at >= v_start and m.movement_type in ('sale', 'refund')) as sold,
      sum(m.quantity) filter (where m.occurred_at >= v_start and m.movement_type = 'adjustment') as adjusted,
      sum(m.quantity) filter (where m.occurred_at >= v_start and m.movement_type in ('count_correction', 'opening_balance')) as counted,
      sum(m.quantity) filter (where m.occurred_at >= v_start and m.movement_type = 'reversal') as reversed,
      sum(m.quantity) as closing
    from public.stock_movements m
    where m.store_id = v_store and m.occurred_at < v_end
    group by m.product_id
  )
  select
    d.department, p.name, p.size, p.sold_by,
    coalesce(s.opening, 0), coalesce(s.received, 0), coalesce(s.sold, 0),
    coalesce(s.adjusted, 0), coalesce(s.counted, 0), coalesce(s.reversed, 0), s.closing
  from sums s
  join public.products p on p.id = s.product_id
  join private.category_departments() d on d.category_id = p.category_id
  where s.received is not null or s.sold is not null or s.adjusted is not null
     or s.counted is not null or s.reversed is not null or coalesce(s.opening, 0) <> 0
  order by d.department, p.name, p.size;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waste and adjustments by reason
-- ---------------------------------------------------------------------------

create function public.report_adjustments_by_reason(p_from date, p_to date)
returns table (
  reason text, adjustments integer, units_out numeric, units_in numeric,
  value numeric, waiting integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  select
    r.name,
    (count(*) filter (where a.status in ('auto_approved', 'approved')))::integer,
    coalesce(-sum(a.quantity) filter (where a.status in ('auto_approved', 'approved') and a.quantity < 0), 0),
    coalesce(sum(a.quantity) filter (where a.status in ('auto_approved', 'approved') and a.quantity > 0), 0),
    case when v_costs then
      round(coalesce(sum(m.quantity * coalesce(mc.unit_cost, 0)), 0), 2)
    end,
    (count(*) filter (where a.status = 'pending'))::integer
  from public.stock_adjustments a
  join public.adjustment_reasons r on r.id = a.reason_id
  left join public.stock_movements m on m.id = a.movement_id
  left join public.stock_movement_costs mc on mc.movement_id = m.id
  where a.store_id = v_store
    and a.requested_at >= private.london_day_start(p_from)
    and a.requested_at < private.london_day_start(p_to + 1)
    and a.status <> 'rejected'
  group by r.name
  order by r.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Count differences
-- ---------------------------------------------------------------------------

create function public.report_counts(p_from date, p_to date)
returns table (
  count_id uuid, name text, scope public.count_scope, as_of timestamptz,
  products integer, with_difference integer, units_added numeric, units_removed numeric,
  value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  select
    c.id, c.name, c.scope, c.as_of,
    count(r.id)::integer,
    (count(r.id) filter (where r.variance_qty <> 0))::integer,
    coalesce(sum(r.variance_qty) filter (where r.variance_qty > 0), 0),
    coalesce(-sum(r.variance_qty) filter (where r.variance_qty < 0), 0),
    case when v_costs then
      round(coalesce(sum(r.variance_qty * coalesce(mc.unit_cost, 0)), 0), 2)
    end
  from public.stock_counts c
  join public.stock_count_results r on r.count_id = c.id
  left join public.stock_movement_costs mc on mc.movement_id = r.movement_id
  where c.store_id = v_store and c.status = 'approved'
    and c.as_of >= private.london_day_start(p_from)
    and c.as_of < private.london_day_start(p_to + 1)
  group by c.id
  order by c.as_of desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deliveries by supplier
-- ---------------------------------------------------------------------------

create function public.report_deliveries_by_supplier(p_from date, p_to date)
returns table (
  supplier text, deliveries integer, returns integer, lines integer,
  units_received numeric, problem_lines integer, net_total numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_costs boolean := private.can_see_costs();
begin
  perform private.report_check();
  return query
  with posted as (
    select i.* from public.supplier_invoices i
    where i.store_id = v_store and i.status = 'posted'
      and i.delivered_at >= private.london_day_start(p_from)
      and i.delivered_at < private.london_day_start(p_to + 1)
  ),
  line_totals as (
    select l.invoice_id,
      (count(*) filter (where l.line_kind = 'stock'))::integer as lines,
      coalesce(sum(l.units_received) filter (where l.line_kind = 'stock'), 0) as units,
      (count(*) filter (where l.discrepancy <> 'none'))::integer as problems
    from public.supplier_invoice_lines l
    where l.invoice_id in (select id from posted)
    group by l.invoice_id
  )
  select
    s.name,
    (count(*) filter (where p.document_type = 'invoice'))::integer,
    (count(*) filter (where p.document_type = 'credit_note'))::integer,
    coalesce(sum(lt.lines), 0)::integer,
    coalesce(sum(case when p.document_type = 'invoice' then lt.units else -lt.units end), 0),
    coalesce(sum(lt.problems), 0)::integer,
    case when v_costs then
      coalesce(sum(case when p.document_type = 'invoice' then t.net_total else -t.net_total end), 0)
    end
  from posted p
  join public.suppliers s on s.id = p.supplier_id
  left join line_totals lt on lt.invoice_id = p.id
  left join public.supplier_invoice_totals t on t.invoice_id = p.id
  group by s.name
  order by s.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

revoke execute on function
  private.report_check(),
  private.london_day_start(date),
  private.category_departments()
from public, anon, authenticated;

revoke execute on function
  public.report_stock_by_department(),
  public.report_stock_products(),
  public.report_movement_totals(date, date),
  public.report_movement_products(date, date),
  public.report_adjustments_by_reason(date, date),
  public.report_counts(date, date),
  public.report_deliveries_by_supplier(date, date)
from public, anon;

grant execute on function
  public.report_stock_by_department(),
  public.report_stock_products(),
  public.report_movement_totals(date, date),
  public.report_movement_products(date, date),
  public.report_adjustments_by_reason(date, date),
  public.report_counts(date, date),
  public.report_deliveries_by_supplier(date, date)
to authenticated;
