-- Phase 4: stock counts.
--
-- A manager starts a count with an "as of" moment (outside trading hours).
-- Staff count with their phones: one line per product and place (shelf,
-- stockroom, chiller…). When counting is finished, a manager reviews the
-- differences against the ledger balance at that moment and approves. Approval
-- is blocked until every day's sales up to that moment are imported, and it
-- writes count corrections (or opening balances for products never counted
-- before), dated at the count's moment.

create type public.count_scope as enum ('full', 'category', 'spot', 'opening');
create type public.count_status as enum ('in_progress', 'submitted', 'approved', 'cancelled');
create type public.uncounted_policy as enum ('leave_unchanged', 'set_to_zero');

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  name text not null check (length(btrim(name)) between 1 and 100),
  scope public.count_scope not null,
  category_id uuid references public.categories (id),
  as_of timestamptz not null,
  status public.count_status not null default 'in_progress',
  uncounted_policy public.uncounted_policy,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  check ((scope = 'category') = (category_id is not null))
);

create index stock_counts_status_idx on public.stock_counts (status, as_of desc);

create trigger stock_counts_set_updated_at
before update on public.stock_counts
for each row when (old is distinct from new)
execute function private.set_updated_at();

create trigger stock_counts_audit after insert or update or delete on public.stock_counts
for each row execute function private.audit();

-- Several lines per product are fine: shelf + stockroom + chiller.
create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  location text not null default 'Shelf' check (length(btrim(location)) between 1 and 40),
  counted_qty numeric(12, 3) not null check (counted_qty >= 0 and counted_qty <= 1000000),
  counted_by uuid default auth.uid() references public.profiles (id),
  counted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_count_lines_count_idx on public.stock_count_lines (count_id, product_id);

create trigger stock_count_lines_set_updated_at
before update on public.stock_count_lines
for each row when (old is distinct from new)
execute function private.set_updated_at();

-- Products a manager has asked to be counted again.
create table public.stock_count_recounts (
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  requested_by uuid default auth.uid() references public.profiles (id),
  requested_at timestamptz not null default now(),
  primary key (count_id, product_id)
);

-- One row per product, written when the count is approved. The value of a
-- difference is the movement's cost (stock_movement_costs), so no cost here.
create table public.stock_count_results (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts (id),
  product_id uuid not null references public.products (id),
  counted_total numeric(12, 3) not null,
  expected_qty numeric(12, 3) not null,
  variance_qty numeric(12, 3) not null,
  -- False for products nobody counted that a full count set to zero.
  was_counted boolean not null default true,
  movement_id uuid references public.stock_movements (id),
  created_at timestamptz not null default now(),
  unique (count_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Every day whose sales are needed but not imported, from the first stock
-- count (or first sales import) up to p_through.
create function private.missing_sales_days(p_store_id uuid, p_through date) returns date[]
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
  select min(occurred_at) into v_first_count
  from public.stock_movements
  where store_id = p_store_id and movement_type = 'opening_balance';
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
  );
  return v_missing;
end;
$$;

-- The last trading day whose sales happened before p_at.
create function private.last_trading_day_before(p_store_id uuid, p_at timestamptz) returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_at at time zone 'Europe/London')::date
    - case when (p_at at time zone 'Europe/London')::time >= s.trading_day_end then 0 else 1 end
  from public.stores s where s.id = p_store_id;
$$;

-- The products a count covers: everything (full), a category and the
-- categories under it, products never counted (opening), or only the
-- products someone counted (spot).
create function private.count_scope_products(p_count_id uuid) returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
begin
  select * into v_count from public.stock_counts where id = p_count_id;
  if v_count.scope = 'full' then
    return query select p.id from public.products p where p.active;
  elsif v_count.scope = 'category' then
    return query
    with recursive tree (id) as (
      select v_count.category_id
      union all
      select c.id from public.categories c join tree t on c.parent_id = t.id
    )
    select p.id from public.products p where p.active and p.category_id in (select id from tree);
  elsif v_count.scope = 'opening' then
    return query
    select p.id from public.products p
    left join public.stock_levels l on l.product_id = p.id and l.store_id = v_count.store_id
    where p.active and l.last_counted_at is null;
  else
    return query select distinct product_id from public.stock_count_lines where count_id = p_count_id;
  end if;
end;
$$;

create function private.editable_count(p_count_id uuid) returns public.stock_counts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
begin
  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found then
    raise exception 'That count does not exist.';
  end if;
  if v_count.status <> 'in_progress' then
    raise exception 'This count is %, so it can no longer be changed.',
      replace(v_count.status::text, '_', ' ');
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting and counting
-- ---------------------------------------------------------------------------

create function public.create_count(
  p_name text,
  p_scope public.count_scope,
  p_as_of timestamptz,
  p_category_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can start a count.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Give the count a name.';
  end if;
  if p_as_of is null or p_as_of > now() + interval '3 days' then
    raise exception 'Choose when the count happens, at most three days ahead.';
  end if;
  if p_scope = 'category' and not exists (
    select 1 from public.categories where id = p_category_id and active
  ) then
    raise exception 'Choose the category to count.';
  end if;

  insert into public.stock_counts (store_id, name, scope, category_id, as_of, notes)
  values (
    private.default_store_id(), left(btrim(p_name), 100), p_scope,
    case when p_scope = 'category' then p_category_id end,
    p_as_of, nullif(btrim(p_notes), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.add_count_line(
  p_count_id uuid,
  p_product_id uuid,
  p_counted_qty numeric,
  p_location text default 'Shelf'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_id uuid;
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to count stock.' using errcode = '42501';
  end if;
  v_count := private.editable_count(p_count_id);
  if not exists (select 1 from public.products where id = p_product_id and active) then
    raise exception 'That product does not exist or is switched off.';
  end if;
  if p_counted_qty is null or p_counted_qty < 0 or p_counted_qty > 1000000 then
    raise exception 'Enter how many you counted (0 or more).';
  end if;
  if v_count.scope in ('category', 'opening')
     and p_product_id not in (select private.count_scope_products(p_count_id)) then
    raise exception '%', case v_count.scope
      when 'category' then 'That product is not in the category being counted.'
      else 'That product already has opening stock. Count it in a full or spot count.'
    end;
  end if;

  insert into public.stock_count_lines (count_id, product_id, location, counted_qty)
  values (p_count_id, p_product_id, coalesce(nullif(btrim(p_location), ''), 'Shelf'), p_counted_qty)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_count_line(
  p_line_id uuid,
  p_counted_qty numeric,
  p_location text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.stock_count_lines;
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to count stock.' using errcode = '42501';
  end if;
  select * into v_line from public.stock_count_lines where id = p_line_id;
  if not found then
    raise exception 'That count line does not exist.';
  end if;
  perform private.editable_count(v_line.count_id);
  if p_counted_qty is null or p_counted_qty < 0 or p_counted_qty > 1000000 then
    raise exception 'Enter how many you counted (0 or more).';
  end if;
  update public.stock_count_lines
  set counted_qty = p_counted_qty,
      location = coalesce(nullif(btrim(p_location), ''), location),
      counted_by = auth.uid(),
      counted_at = now()
  where id = p_line_id;
end;
$$;

create function public.remove_count_line(p_line_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.stock_count_lines;
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to count stock.' using errcode = '42501';
  end if;
  select * into v_line from public.stock_count_lines where id = p_line_id;
  if not found then
    raise exception 'That count line does not exist.';
  end if;
  perform private.editable_count(v_line.count_id);
  delete from public.stock_count_lines where id = p_line_id;
end;
$$;

create function public.submit_count(p_count_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to count stock.' using errcode = '42501';
  end if;
  perform private.editable_count(p_count_id);
  if not exists (select 1 from public.stock_count_lines where count_id = p_count_id) then
    raise exception 'Count at least one product first.';
  end if;
  delete from public.stock_count_recounts where count_id = p_count_id;
  update public.stock_counts
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_count_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

-- One row per product: what was counted, what the ledger expected at the
-- count's moment, the difference and whether it is big enough to recount.
-- Unit costs only for people who may see costs.
create function public.count_review(p_count_id uuid)
returns table (
  product_id uuid,
  product_name text,
  product_size text,
  sold_by public.sold_by,
  counted_total numeric,
  line_count integer,
  expected_qty numeric,
  variance_qty numeric,
  unit_cost numeric,
  flagged boolean,
  recount_requested boolean,
  last_counted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_units numeric := coalesce(private.setting_number('recount_units'), 20);
  v_value numeric := coalesce(private.setting_number('recount_value'), 25);
  v_costs boolean := private.can_see_costs();
begin
  if not private.has_role('owner', 'manager', 'viewer') then
    raise exception 'Only owners, managers and viewers can review counts.' using errcode = '42501';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id;
  if not found then
    raise exception 'That count does not exist.';
  end if;

  return query
  with in_count as (
    select distinct x.id from (
      select l.product_id as id from public.stock_count_lines l where l.count_id = p_count_id
      union
      select s.id from private.count_scope_products(p_count_id) s(id)
    ) x
  ),
  counted as (
    select l.product_id, sum(l.counted_qty) as total, count(*)::integer as lines
    from public.stock_count_lines l where l.count_id = p_count_id
    group by l.product_id
  ),
  review as (
    select
      p.id, p.name, p.size, p.sold_by, c.total, coalesce(c.lines, 0) as lines,
      case when v_count.status = 'approved' then r.expected_qty
        else private.stock_balance_as_of(v_count.store_id, p.id, v_count.as_of) end as expected,
      sc.average_unit_cost as avg_cost,
      exists (
        select 1 from public.stock_count_recounts rc
        where rc.count_id = p_count_id and rc.product_id = p.id
      ) as recount,
      sl.last_counted_at
    from in_count pr
    join public.products p on p.id = pr.id
    left join counted c on c.product_id = p.id
    left join public.stock_count_results r on r.count_id = p_count_id and r.product_id = p.id
    left join public.stock_costs sc on sc.store_id = v_count.store_id and sc.product_id = p.id
    left join public.stock_levels sl on sl.store_id = v_count.store_id and sl.product_id = p.id
  )
  select
    review.id, review.name, review.size, review.sold_by, review.total, review.lines, review.expected,
    review.total - review.expected,
    case when v_costs then review.avg_cost end,
    review.total is not null and (
      abs(review.total - review.expected) > v_units
      or abs(review.total - review.expected) * coalesce(review.avg_cost, 0) > v_value
    ),
    review.recount,
    review.last_counted_at
  from review
  order by review.name, review.size;
end;
$$;

-- What stands between a count and its approval.
create function public.count_readiness(p_count_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_day date;
  v_missing date[];
  v_unposted integer;
begin
  if not private.is_active_user() then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id;
  if not found then
    raise exception 'That count does not exist.';
  end if;
  v_day := private.last_trading_day_before(v_count.store_id, v_count.as_of);
  v_missing := private.missing_sales_days(v_count.store_id, v_day);
  select count(*) into v_unposted from public.supplier_invoices
  where store_id = v_count.store_id and status in ('draft', 'checked_in')
    and delivered_at <= v_count.as_of;

  return jsonb_build_object(
    'happened', v_count.as_of <= now(),
    'sales_needed_through', v_day,
    'missing_sales_days', to_jsonb(v_missing[1:31]),
    'missing_sales_count', coalesce(cardinality(v_missing), 0),
    'unposted_deliveries', v_unposted
  );
end;
$$;

create function public.request_recounts(p_count_id uuid, p_product_ids uuid[]) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_added integer;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can ask for recounts.' using errcode = '42501';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found or v_count.status not in ('in_progress', 'submitted') then
    raise exception 'Only a count that has not been approved can be recounted.';
  end if;
  if coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'Choose the products to count again.';
  end if;

  -- Counting again starts from scratch for these products.
  delete from public.stock_count_lines
  where count_id = p_count_id and product_id = any (p_product_ids);
  insert into public.stock_count_recounts (count_id, product_id)
  select p_count_id, unnest(p_product_ids)
  on conflict do nothing;
  get diagnostics v_added = row_count;

  update public.stock_counts
  set status = 'in_progress', submitted_at = null, submitted_by = null
  where id = p_count_id;
  return cardinality(p_product_ids);
end;
$$;

create function public.cancel_count(p_count_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can cancel a count.' using errcode = '42501';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found then
    raise exception 'That count does not exist.';
  end if;
  if v_count.status not in ('in_progress', 'submitted') then
    raise exception 'This count is %, so it cannot be cancelled.', v_count.status;
  end if;
  update public.stock_counts
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_count_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approval: the only way a count changes stock.
-- ---------------------------------------------------------------------------

create function public.approve_count(
  p_count_id uuid,
  p_uncounted_policy public.uncounted_policy default 'leave_unchanged'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count public.stock_counts;
  v_day date;
  v_missing date[];
  v_row record;
  v_expected numeric;
  v_variance numeric;
  v_first boolean;
  v_cost numeric;
  v_result_id uuid;
  v_movement uuid;
  v_products integer := 0;
  v_corrections integer := 0;
  v_up numeric := 0;
  v_down numeric := 0;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can approve counts.' using errcode = '42501';
  end if;
  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found then
    raise exception 'That count does not exist.';
  end if;
  if v_count.status <> 'submitted' then
    raise exception 'Only a count that has been finished can be approved. This one is %.',
      replace(v_count.status::text, '_', ' ');
  end if;
  if v_count.as_of > now() then
    raise exception 'This count is for %, which has not happened yet.',
      to_char(v_count.as_of at time zone 'Europe/London', 'FMDD Mon YYYY HH24:MI');
  end if;

  v_day := private.last_trading_day_before(v_count.store_id, v_count.as_of);
  v_missing := private.missing_sales_days(v_count.store_id, v_day);
  if cardinality(v_missing) > 0 then
    raise exception 'Import the sales for % first. The count needs every sale up to %.',
      case when cardinality(v_missing) = 1 then to_char(v_missing[1], 'FMDD Mon YYYY')
        else to_char(v_missing[1], 'FMDD Mon') || ' and ' || (cardinality(v_missing) - 1)::text || ' other day(s)'
      end,
      to_char(v_day, 'FMDD Mon YYYY');
  end if;

  for v_row in
    with counted as (
      select l.product_id, sum(l.counted_qty) as total
      from public.stock_count_lines l where l.count_id = p_count_id
      group by l.product_id
    ),
    targets as (
      select c.product_id, c.total, true as was_counted from counted c
      union all
      select s.id, 0, false
      from private.count_scope_products(p_count_id) s(id)
      where p_uncounted_policy = 'set_to_zero'
        and v_count.scope in ('full', 'category')
        and s.id not in (select product_id from counted)
    )
    select t.*, p.name, l.last_counted_at
    from targets t
    join public.products p on p.id = t.product_id
    left join public.stock_levels l on l.store_id = v_count.store_id and l.product_id = t.product_id
    order by p.name
  loop
    if v_row.last_counted_at > v_count.as_of then
      raise exception '% was counted on %, after this count. Take it out of this count first.',
        v_row.name, to_char(v_row.last_counted_at at time zone 'Europe/London', 'FMDD Mon YYYY');
    end if;

    v_expected := private.stock_balance_as_of(v_count.store_id, v_row.product_id, v_count.as_of);
    v_variance := v_row.total - v_expected;
    v_first := v_row.last_counted_at is null;

    insert into public.stock_count_results
      (count_id, product_id, counted_total, expected_qty, variance_qty, was_counted)
    values (p_count_id, v_row.product_id, v_row.total, v_expected, v_variance, v_row.was_counted)
    returning id into v_result_id;

    if v_variance <> 0 then
      v_cost := private.average_cost(v_count.store_id, v_row.product_id);
      if v_cost is null then
        select lc.unit_cost into v_cost
        from public.supplier_products sp
        join public.supplier_product_latest_costs lc on lc.supplier_product_id = sp.id
        where sp.product_id = v_row.product_id and sp.active
        order by sp.is_preferred desc, lc.effective_date desc
        limit 1;
      end if;
      v_movement := private.apply_movement(
        v_count.store_id, v_row.product_id,
        case when v_first then 'opening_balance' else 'count_correction' end::public.movement_type,
        v_variance, v_cost, v_count.as_of, 'count_result', v_result_id, null,
        left(v_count.name, 200));
      update public.stock_count_results set movement_id = v_movement where id = v_result_id;
      v_corrections := v_corrections + 1;
      if v_variance > 0 then v_up := v_up + v_variance; else v_down := v_down - v_variance; end if;
    else
      insert into public.stock_levels (store_id, product_id, last_counted_at)
      values (v_count.store_id, v_row.product_id, v_count.as_of)
      on conflict (store_id, product_id) do update
      set last_counted_at = greatest(public.stock_levels.last_counted_at, excluded.last_counted_at);
    end if;
    v_products := v_products + 1;
  end loop;

  update public.stock_counts
  set status = 'approved', approved_at = now(), approved_by = auth.uid(),
      uncounted_policy = case when scope in ('full', 'category') then p_uncounted_policy end
  where id = p_count_id;

  return jsonb_build_object(
    'products', v_products, 'corrections', v_corrections,
    'units_added', v_up, 'units_removed', v_down);
end;
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_recounts enable row level security;
alter table public.stock_count_results enable row level security;

create policy "Active users can read counts"
on public.stock_counts for select to authenticated
using ((select private.is_active_user()));

create policy "Active users can read count lines"
on public.stock_count_lines for select to authenticated
using ((select private.is_active_user()));

create policy "Active users can read recount requests"
on public.stock_count_recounts for select to authenticated
using ((select private.is_active_user()));

-- Results show expected stock, so stock staff (who count blind) cannot read them.
create policy "Owners, managers and viewers can read count results"
on public.stock_count_results for select to authenticated
using ((select private.has_role('owner', 'manager', 'viewer')));

revoke insert, update, delete, truncate, references, trigger
  on public.stock_counts, public.stock_count_lines, public.stock_count_recounts,
     public.stock_count_results
  from authenticated;
revoke all
  on public.stock_counts, public.stock_count_lines, public.stock_count_recounts,
     public.stock_count_results
  from anon;

revoke execute on function
  private.missing_sales_days(uuid, date),
  private.last_trading_day_before(uuid, timestamptz),
  private.count_scope_products(uuid),
  private.editable_count(uuid)
from public, anon, authenticated;

revoke execute on function
  public.create_count(text, public.count_scope, timestamptz, uuid, text),
  public.add_count_line(uuid, uuid, numeric, text),
  public.update_count_line(uuid, numeric, text),
  public.remove_count_line(uuid),
  public.submit_count(uuid),
  public.count_review(uuid),
  public.count_readiness(uuid),
  public.request_recounts(uuid, uuid[]),
  public.cancel_count(uuid),
  public.approve_count(uuid, public.uncounted_policy)
from public, anon;

grant execute on function
  public.create_count(text, public.count_scope, timestamptz, uuid, text),
  public.add_count_line(uuid, uuid, numeric, text),
  public.update_count_line(uuid, numeric, text),
  public.remove_count_line(uuid),
  public.submit_count(uuid),
  public.count_review(uuid),
  public.count_readiness(uuid),
  public.request_recounts(uuid, uuid[]),
  public.cancel_count(uuid),
  public.approve_count(uuid, public.uncounted_policy)
to authenticated;
