-- Suppliers, the codes and case sizes they use for our products, and the
-- history of what each case has cost (cost data: hidden from stock staff).

create type public.cost_source as enum ('invoice', 'import', 'manual');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  account_number text check (length(account_number) <= 40),
  contact_name text check (length(contact_name) <= 100),
  phone text check (length(phone) <= 40),
  email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  payment_terms_days integer check (payment_terms_days between 0 and 365),
  delivery_days text check (length(delivery_days) <= 60),
  -- Days from ordering to delivery; used for reorder suggestions.
  lead_time_days integer not null default 1 check (lead_time_days between 0 and 60),
  notes text check (length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

create unique index suppliers_name_key on public.suppliers (lower(name));

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row when (old is distinct from new)
execute function private.set_updated_at();

-- The "translation table": supplier code 44521 = case of 24 x our product.
create table public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  product_id uuid not null references public.products (id),
  supplier_code text check (length(btrim(supplier_code)) between 1 and 40),
  supplier_description text check (length(supplier_description) <= 200),
  units_per_case numeric(12, 3) not null check (units_per_case > 0),
  is_preferred boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

create unique index supplier_products_code_key
  on public.supplier_products (supplier_id, upper(supplier_code))
  where active and supplier_code is not null;
create unique index supplier_products_preferred_key
  on public.supplier_products (product_id) where is_preferred and active;
create index supplier_products_product_idx on public.supplier_products (product_id);

create trigger supplier_products_set_updated_at
before update on public.supplier_products
for each row when (old is distinct from new)
execute function private.set_updated_at();

create table public.supplier_cost_history (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products (id),
  -- Both ex VAT. unit_cost = case_cost / units_per_case at the time.
  case_cost numeric(12, 4) not null check (case_cost >= 0),
  unit_cost numeric(12, 4) not null check (unit_cost >= 0),
  effective_date date not null default private.london_today(),
  -- Change in unit cost against the previous cost from this supplier.
  change_pct numeric(8, 2),
  source public.cost_source not null,
  -- Set for costs taken from a posted delivery (deliveries arrive in Phase 2).
  invoice_line_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);

create index supplier_cost_history_latest_idx
  on public.supplier_cost_history (supplier_product_id, effective_date desc, created_at desc);

-- Latest cost per supplier product. Stock staff see no rows (RLS on the table).
create view public.supplier_product_latest_costs
with (security_invoker = true)
as
select distinct on (h.supplier_product_id)
  h.supplier_product_id,
  h.case_cost,
  h.unit_cost,
  h.change_pct,
  h.effective_date,
  h.source
from public.supplier_cost_history h
order by h.supplier_product_id, h.effective_date desc, h.created_at desc;

-- Adds a cost row unless it repeats the latest cost. Returns null when unchanged.
create function private.insert_supplier_cost(
  p_supplier_product_id uuid,
  p_case_cost numeric,
  p_effective_date date,
  p_source public.cost_source
) returns public.supplier_cost_history
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_units numeric;
  v_unit_cost numeric;
  v_latest public.supplier_cost_history;
  v_row public.supplier_cost_history;
begin
  select units_per_case into v_units
  from public.supplier_products where id = p_supplier_product_id;
  if not found then
    raise exception 'Supplier product % does not exist.', p_supplier_product_id;
  end if;
  if p_case_cost is null or p_case_cost < 0 then
    raise exception 'A case cost must be zero or more.';
  end if;

  v_unit_cost := round(p_case_cost / v_units, 4);

  select * into v_latest
  from public.supplier_cost_history
  where supplier_product_id = p_supplier_product_id
  order by effective_date desc, created_at desc
  limit 1;

  if found and v_latest.case_cost = p_case_cost and v_latest.unit_cost = v_unit_cost then
    return null;
  end if;

  insert into public.supplier_cost_history
    (supplier_product_id, case_cost, unit_cost, effective_date, change_pct, source)
  values (
    p_supplier_product_id,
    p_case_cost,
    v_unit_cost,
    p_effective_date,
    case when v_latest.unit_cost > 0
      then round((v_unit_cost - v_latest.unit_cost) / v_latest.unit_cost * 100, 2)
    end,
    p_source
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Managers record a cost by hand (deliveries will record them automatically).
create function public.record_supplier_cost(
  p_supplier_product_id uuid,
  p_case_cost numeric,
  p_effective_date date default null
) returns public.supplier_cost_history
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can record costs.' using errcode = '42501';
  end if;
  return private.insert_supplier_cost(
    p_supplier_product_id,
    p_case_cost,
    coalesce(p_effective_date, private.london_today()),
    'manual'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit and Row Level Security
-- ---------------------------------------------------------------------------

create trigger suppliers_audit after insert or update or delete on public.suppliers
for each row execute function private.audit();
create trigger supplier_products_audit after insert or update or delete on public.supplier_products
for each row execute function private.audit();
create trigger supplier_cost_history_audit after insert or update or delete on public.supplier_cost_history
for each row execute function private.audit();

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_cost_history enable row level security;

create policy "Active users can read suppliers"
on public.suppliers for select to authenticated
using ((select private.is_active_user()));

create policy "Owners and managers can add suppliers"
on public.suppliers for insert to authenticated
with check ((select private.has_role('owner', 'manager')));

create policy "Owners and managers can update suppliers"
on public.suppliers for update to authenticated
using ((select private.has_role('owner', 'manager')))
with check ((select private.has_role('owner', 'manager')));

create policy "Active users can read supplier products"
on public.supplier_products for select to authenticated
using ((select private.is_active_user()));

create policy "Owners and managers can add supplier products"
on public.supplier_products for insert to authenticated
with check ((select private.has_role('owner', 'manager')));

create policy "Owners and managers can update supplier products"
on public.supplier_products for update to authenticated
using ((select private.has_role('owner', 'manager')))
with check ((select private.has_role('owner', 'manager')));

-- Costs are written only by functions; only cost-viewing roles can read them.
create policy "Owners, managers and viewers can read costs"
on public.supplier_cost_history for select to authenticated
using ((select private.can_see_costs()));
