-- The stock ledger: every change to stock is a movement, like a line on a bank
-- statement, and stock on hand is the running balance.
--
--   stock_movements       one row per change; never edited or deleted
--   stock_movement_costs  the unit cost of a movement (cost data)
--   stock_levels          running total per product per store
--   stock_costs           weighted average and last unit cost (cost data)
--
-- Only private.apply_movement writes these tables. Everything that changes
-- stock (posting a delivery, an adjustment, opening stock) calls it inside its
-- own transaction, so a change either happens completely or not at all.

alter type public.import_type add value if not exists 'opening_stock';

create type public.movement_type as enum (
  'opening_balance',
  'receipt',
  'supplier_return',
  'sale',
  'refund',
  'adjustment',
  'count_correction',
  'reversal'
);

create type public.movement_source as enum (
  'opening_stock',
  'delivery_line',
  'adjustment',
  'count_result',
  'sales_line'
);

-- ---------------------------------------------------------------------------
-- Adjustment reasons
-- ---------------------------------------------------------------------------

create table public.adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  direction text not null check (direction in ('decrease', 'increase', 'either')),
  note_required boolean not null default false,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index adjustment_reasons_name_key on public.adjustment_reasons (lower(name));

create trigger adjustment_reasons_set_updated_at
before update on public.adjustment_reasons
for each row when (old is distinct from new)
execute function private.set_updated_at();

insert into public.adjustment_reasons (name, direction, note_required, sort_order) values
  ('Waste', 'decrease', false, 10),
  ('Damaged', 'decrease', false, 20),
  ('Expired', 'decrease', false, 30),
  ('Theft or unknown loss', 'decrease', false, 40),
  ('Own use', 'decrease', false, 50),
  ('Found', 'increase', false, 60),
  ('Correction', 'either', true, 70);

-- ---------------------------------------------------------------------------
-- Movements
-- ---------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  product_id uuid not null references public.products (id),
  movement_type public.movement_type not null,
  -- Single items or kg: + in, − out.
  quantity numeric(12, 3) not null check (quantity <> 0),
  reason_id uuid references public.adjustment_reasons (id),
  source_type public.movement_source,
  source_id uuid,
  -- Set on a reversal: the movement it cancels. Each can be reversed once.
  reverses_id uuid unique references public.stock_movements (id),
  -- When it physically happened (a delivery's arrival time, for example).
  occurred_at timestamptz not null,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  check ((movement_type = 'reversal') = (reverses_id is not null))
);

create index stock_movements_product_idx
  on public.stock_movements (store_id, product_id, occurred_at desc);
create index stock_movements_occurred_idx on public.stock_movements (occurred_at desc);
create index stock_movements_source_idx on public.stock_movements (source_type, source_id);

create table public.stock_movement_costs (
  movement_id uuid primary key references public.stock_movements (id),
  -- Ex VAT, per single item or kg.
  unit_cost numeric(12, 4) not null check (unit_cost >= 0)
);

-- The ledger is append-only, even for administrators: mistakes are fixed
-- with reversing movements so the history always explains the balance.
create function private.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Stock movements cannot be changed or deleted. Record a reversing movement instead.';
end;
$$;

create trigger stock_movements_append_only
before update or delete on public.stock_movements
for each row execute function private.forbid_change();

create trigger stock_movement_costs_append_only
before update or delete on public.stock_movement_costs
for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Running totals
-- ---------------------------------------------------------------------------

create table public.stock_levels (
  store_id uuid not null references public.stores (id),
  product_id uuid not null references public.products (id),
  quantity_on_hand numeric(12, 3) not null default 0,
  last_movement_at timestamptz,
  last_counted_at timestamptz,
  primary key (store_id, product_id)
);

create index stock_levels_product_idx on public.stock_levels (product_id);

create table public.stock_costs (
  store_id uuid not null references public.stores (id),
  product_id uuid not null references public.products (id),
  average_unit_cost numeric(12, 4) check (average_unit_cost >= 0),
  last_unit_cost numeric(12, 4) check (last_unit_cost >= 0),
  primary key (store_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The store the signed-in person works in. One store for now; scripts and
-- system jobs (no signed-in user) get the first active store.
create function private.default_store_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select m.store_id
      from public.store_members m
      join public.stores s on s.id = m.store_id and s.active
      where m.profile_id = auth.uid()
      order by s.created_at
      limit 1
    ),
    (select id from public.stores where active order by created_at limit 1)
  )
$$;

-- Stock on hand at a moment in the past: the sum of movements up to then.
create function private.stock_balance_as_of(p_store_id uuid, p_product_id uuid, p_at timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)
  from public.stock_movements
  where store_id = p_store_id and product_id = p_product_id and occurred_at <= p_at
$$;

-- The one place stock changes. Writes the movement (and its cost), updates
-- the running total and keeps the weighted average cost:
--   new average = (stock on hand × old average + units in × unit cost)
--                 ÷ (stock on hand + units in)
-- with negative stock on hand treated as zero.
create function private.apply_movement(
  p_store_id uuid,
  p_product_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_cost numeric,
  p_occurred_at timestamptz,
  p_source_type public.movement_source,
  p_source_id uuid,
  p_reason_id uuid default null,
  p_note text default null,
  p_reverses_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_on_hand numeric;
  v_base numeric;
  v_average numeric;
  v_reversed_type public.movement_type;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'A stock movement needs a quantity other than zero.';
  end if;

  -- Lock this product's running total so two changes cannot interleave.
  insert into public.stock_levels (store_id, product_id)
  values (p_store_id, p_product_id)
  on conflict do nothing;
  select quantity_on_hand into v_on_hand
  from public.stock_levels
  where store_id = p_store_id and product_id = p_product_id
  for update;

  insert into public.stock_movements
    (store_id, product_id, movement_type, quantity, reason_id, source_type,
     source_id, reverses_id, occurred_at, note)
  values
    (p_store_id, p_product_id, p_type, p_quantity, p_reason_id, p_source_type,
     p_source_id, p_reverses_id, p_occurred_at, nullif(btrim(p_note), ''))
  returning id into v_id;

  if p_unit_cost is not null then
    insert into public.stock_movement_costs (movement_id, unit_cost)
    values (v_id, round(p_unit_cost, 4));
  end if;

  if p_reverses_id is not null then
    select movement_type into v_reversed_type
    from public.stock_movements where id = p_reverses_id;
  end if;

  -- Stock arriving at a known cost moves the average; so does undoing it.
  if p_unit_cost is not null
     and (p_type in ('receipt', 'opening_balance')
          or v_reversed_type in ('receipt', 'opening_balance')) then
    insert into public.stock_costs (store_id, product_id)
    values (p_store_id, p_product_id)
    on conflict do nothing;
    select average_unit_cost into v_average
    from public.stock_costs
    where store_id = p_store_id and product_id = p_product_id
    for update;

    v_base := greatest(v_on_hand, 0);
    if v_average is null or v_base = 0 then
      v_average := case when p_quantity > 0 then p_unit_cost else v_average end;
    elsif v_base + p_quantity > 0 then
      v_average := (v_base * v_average + p_quantity * p_unit_cost) / (v_base + p_quantity);
    end if;

    update public.stock_costs set
      average_unit_cost = round(v_average, 4),
      last_unit_cost = case
        when p_type = 'receipt' then round(p_unit_cost, 4)
        else coalesce(last_unit_cost, round(p_unit_cost, 4))
      end
    where store_id = p_store_id and product_id = p_product_id;
  end if;

  update public.stock_levels set
    quantity_on_hand = quantity_on_hand + p_quantity,
    last_movement_at = greatest(coalesce(last_movement_at, p_occurred_at), p_occurred_at),
    last_counted_at = case
      when p_type in ('opening_balance', 'count_correction')
        then greatest(coalesce(last_counted_at, p_occurred_at), p_occurred_at)
      else last_counted_at
    end
  where store_id = p_store_id and product_id = p_product_id;

  return v_id;
end;
$$;

-- Reverses one movement: the same quantity the other way, dated at the
-- original time so past balances are corrected too.
create function private.reverse_movement(p_movement_id uuid, p_note text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.stock_movements;
  v_unit_cost numeric;
begin
  select * into v_movement from public.stock_movements where id = p_movement_id;
  if not found then
    raise exception 'Stock movement % does not exist.', p_movement_id;
  end if;
  if exists (select 1 from public.stock_movements where reverses_id = p_movement_id) then
    return null; -- Already reversed.
  end if;
  select unit_cost into v_unit_cost from public.stock_movement_costs where movement_id = p_movement_id;

  return private.apply_movement(
    v_movement.store_id, v_movement.product_id, 'reversal', -v_movement.quantity,
    v_unit_cost, v_movement.occurred_at, v_movement.source_type, v_movement.source_id,
    v_movement.reason_id, p_note, p_movement_id
  );
end;
$$;

-- Products whose running total does not match the sum of their movements.
-- Should always be empty; checked by the tests and, later, every night.
create function public.stock_ledger_mismatches()
returns table (store_id uuid, product_id uuid, level_quantity numeric, ledger_quantity numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can check the ledger.' using errcode = '42501';
  end if;
  return query
  with ledger as (
    select m.store_id, m.product_id, sum(m.quantity) as total
    from public.stock_movements m
    group by m.store_id, m.product_id
  )
  select
    coalesce(l.store_id, g.store_id),
    coalesce(l.product_id, g.product_id),
    coalesce(l.quantity_on_hand, 0),
    coalesce(g.total, 0)
  from public.stock_levels l
  full join ledger g on g.store_id = l.store_id and g.product_id = l.product_id
  where coalesce(l.quantity_on_hand, 0) <> coalesce(g.total, 0);
end;
$$;

-- Headline numbers for the dashboard. Stock value only for cost viewers.
create function public.stock_summary() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_result jsonb;
begin
  if not private.is_active_user() then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'low_stock', count(*) filter (
      where p.reorder_point is not null and coalesce(l.quantity_on_hand, 0) <= p.reorder_point
        and l.last_counted_at is not null),
    'negative_stock', count(*) filter (where l.quantity_on_hand < 0),
    'never_counted', count(*) filter (where l.last_counted_at is null),
    'stock_value', case when private.can_see_costs() then (
      select round(coalesce(sum(greatest(sl.quantity_on_hand, 0) * sc.average_unit_cost), 0), 2)
      from public.stock_levels sl
      join public.stock_costs sc on sc.store_id = sl.store_id and sc.product_id = sl.product_id
      where sl.store_id = v_store
    ) end
  )
  into v_result
  from public.products p
  left join public.stock_levels l on l.product_id = p.id and l.store_id = v_store
  where p.active;

  return v_result;
end;
$$;

-- One row per product with its stock, for the stock list. Cost data is not
-- here; cost viewers read stock_costs alongside it.
create view public.stock_overview
with (security_invoker = true)
as
select
  p.id as product_id,
  l.store_id,
  p.name,
  p.brand,
  p.size,
  p.category_id,
  cp.path as category_path,
  p.sold_by,
  p.reorder_point,
  p.reorder_qty,
  p.till_code,
  p.active,
  coalesce(l.quantity_on_hand, 0) as quantity_on_hand,
  l.last_movement_at,
  l.last_counted_at,
  (p.reorder_point is not null and l.last_counted_at is not null
    and coalesce(l.quantity_on_hand, 0) <= p.reorder_point) as is_low,
  (
    select b.barcode from public.product_barcodes b
    where b.product_id = p.id and b.active and b.is_primary
  ) as primary_barcode
from public.products p
join public.category_paths cp on cp.id = p.category_id
left join public.stock_levels l
  on l.product_id = p.id and l.store_id = (select private.default_store_id());

-- ---------------------------------------------------------------------------
-- Audit and Row Level Security
-- ---------------------------------------------------------------------------

create trigger adjustment_reasons_audit after insert or update or delete on public.adjustment_reasons
for each row execute function private.audit();

alter table public.adjustment_reasons enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movement_costs enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_costs enable row level security;

create policy "Active users can read adjustment reasons"
on public.adjustment_reasons for select to authenticated
using ((select private.is_active_user()));

create policy "Owners can add adjustment reasons"
on public.adjustment_reasons for insert to authenticated
with check ((select private.has_role('owner')));

create policy "Owners can change adjustment reasons"
on public.adjustment_reasons for update to authenticated
using ((select private.has_role('owner')))
with check ((select private.has_role('owner')));

create policy "Active users can read stock movements"
on public.stock_movements for select to authenticated
using ((select private.is_active_user()));

create policy "Owners, managers and viewers can read movement costs"
on public.stock_movement_costs for select to authenticated
using ((select private.can_see_costs()));

create policy "Active users can read stock levels"
on public.stock_levels for select to authenticated
using ((select private.is_active_user()));

create policy "Owners, managers and viewers can read stock costs"
on public.stock_costs for select to authenticated
using ((select private.can_see_costs()));

-- Ledger tables are written only by the functions above.
revoke insert, update, delete, truncate, references, trigger on
  public.stock_movements, public.stock_movement_costs, public.stock_levels, public.stock_costs
from authenticated;
revoke all on
  public.stock_movements, public.stock_movement_costs, public.stock_levels, public.stock_costs,
  public.adjustment_reasons, public.stock_overview
from anon;
revoke delete, truncate, references, trigger on public.adjustment_reasons from authenticated;
revoke insert, update, delete on public.stock_overview from authenticated;

revoke execute on function
  private.forbid_change(),
  private.default_store_id(),
  private.stock_balance_as_of(uuid, uuid, timestamptz),
  private.apply_movement(uuid, uuid, public.movement_type, numeric, numeric, timestamptz,
    public.movement_source, uuid, uuid, text, uuid),
  private.reverse_movement(uuid, text)
from public, anon, authenticated;

-- The stock list view calls default_store_id() as the signed-in user.
grant execute on function private.default_store_id() to authenticated;

revoke execute on function public.stock_ledger_mismatches(), public.stock_summary() from public, anon;
grant execute on function public.stock_ledger_mismatches(), public.stock_summary() to authenticated;
