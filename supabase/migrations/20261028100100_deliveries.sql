-- Deliveries: supplier invoices and credit notes (called "Deliveries" in the
-- app). Staff check in what arrived; a manager enters the costs and posts the
-- delivery, which adds the stock. Costs live in their own tables so stock
-- staff cannot read them. Every change goes through the functions below.

create type public.document_type as enum ('invoice', 'credit_note');
create type public.delivery_status as enum ('draft', 'checked_in', 'posted', 'void');
create type public.delivery_source as enum ('manual', 'upload', 'email');
create type public.line_kind as enum ('stock', 'non_stock');
create type public.discrepancy as enum ('none', 'short', 'damaged', 'substituted', 'extra');

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  supplier_id uuid not null references public.suppliers (id),
  document_type public.document_type not null default 'invoice',
  invoice_number text check (length(btrim(invoice_number)) between 1 and 40),
  invoice_date date,
  -- When the goods arrived (or left, for a return). Stock movements use it.
  delivered_at timestamptz not null,
  status public.delivery_status not null default 'draft',
  source public.delivery_source not null default 'manual',
  notes text check (length(notes) <= 1000),
  checked_in_by uuid references public.profiles (id),
  checked_in_at timestamptz,
  posted_by uuid references public.profiles (id),
  posted_at timestamptz,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  void_reason text check (length(void_reason) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- One invoice number per supplier and document type (voided ones excepted,
-- so a corrected copy can be entered again).
create unique index supplier_invoices_number_key
  on public.supplier_invoices (supplier_id, document_type, upper(invoice_number))
  where invoice_number is not null and status <> 'void';
create index supplier_invoices_status_idx on public.supplier_invoices (status, delivered_at desc);
create index supplier_invoices_supplier_idx on public.supplier_invoices (supplier_id, delivered_at desc);

create trigger supplier_invoices_set_updated_at
before update on public.supplier_invoices
for each row when (old is distinct from new)
execute function private.set_updated_at();

-- Cost data: the totals as printed on the invoice, ex VAT, VAT and total.
create table public.supplier_invoice_totals (
  invoice_id uuid primary key references public.supplier_invoices (id),
  net_total numeric(12, 4) check (net_total >= 0),
  vat_total numeric(12, 4) check (vat_total >= 0),
  gross_total numeric(12, 4) check (gross_total >= 0),
  updated_at timestamptz not null default now()
);

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  line_number integer not null check (line_number > 0),
  line_kind public.line_kind not null default 'stock',
  product_id uuid references public.products (id),
  supplier_product_id uuid references public.supplier_products (id),
  printed_code text check (length(printed_code) <= 40),
  printed_description text check (length(printed_description) <= 200),
  -- Copied at the time: suppliers change their case sizes.
  units_per_case numeric(12, 3) not null default 1 check (units_per_case > 0),
  -- On a credit note: cases credited, and cases sent back.
  cases_invoiced numeric(12, 3) not null default 0 check (cases_invoiced >= 0),
  cases_received numeric(12, 3) not null default 0 check (cases_received >= 0),
  units_received numeric(12, 3) generated always as (round(cases_received * units_per_case, 3)) stored,
  discrepancy public.discrepancy not null default 'none',
  note text check (length(note) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (invoice_id, line_number),
  check (line_kind = 'non_stock' or product_id is not null)
);

create index supplier_invoice_lines_product_idx on public.supplier_invoice_lines (product_id);

-- No "only if changed" condition here: Postgres does not allow one on a
-- table with a generated column (units_received).
create trigger supplier_invoice_lines_set_updated_at
before update on public.supplier_invoice_lines
for each row execute function private.set_updated_at();

-- Cost data per line. Stock lines have a case cost (line net = case cost ×
-- cases invoiced); charges such as delivery have a net amount instead.
create table public.supplier_invoice_line_costs (
  line_id uuid primary key references public.supplier_invoice_lines (id) on delete cascade,
  case_cost numeric(12, 4) check (case_cost >= 0),
  net_amount numeric(12, 4) check (net_amount >= 0),
  vat_rate_pct numeric(5, 2) not null default 0 check (vat_rate_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  check (case_cost is not null or net_amount is not null)
);

-- Photos and PDFs of the paperwork, kept in private storage.
create table public.supplier_invoice_files (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices (id),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);

create index supplier_invoice_files_invoice_idx on public.supplier_invoice_files (invoice_id);

-- Costs recorded from a posted delivery point back to its line.
alter table public.supplier_cost_history
  add constraint supplier_cost_history_invoice_line_fkey
  foreign key (invoice_line_id) references public.supplier_invoice_lines (id);

create index supplier_cost_history_invoice_line_idx on public.supplier_cost_history (invoice_line_id);

-- Delivery list: one row per delivery with its supplier and line counts.
-- gross_total is empty for people who cannot see costs.
create view public.delivery_overview
with (security_invoker = true)
as
select
  i.id,
  i.store_id,
  i.supplier_id,
  s.name as supplier_name,
  i.document_type,
  i.invoice_number,
  i.invoice_date,
  i.delivered_at,
  i.status,
  i.notes,
  i.checked_in_at,
  i.posted_at,
  i.voided_at,
  i.void_reason,
  i.created_at,
  i.created_by,
  (select count(*) from public.supplier_invoice_lines l where l.invoice_id = i.id)::integer as line_count,
  (
    select coalesce(sum(l.units_received), 0) from public.supplier_invoice_lines l
    where l.invoice_id = i.id and l.line_kind = 'stock'
  ) as units_received,
  t.gross_total
from public.supplier_invoices i
join public.suppliers s on s.id = i.supplier_id
left join public.supplier_invoice_totals t on t.invoice_id = i.id;

-- ---------------------------------------------------------------------------
-- Supplier costs from invoices: add the line they came from.
-- ---------------------------------------------------------------------------

drop function private.insert_supplier_cost(uuid, numeric, date, public.cost_source);

create function private.insert_supplier_cost(
  p_supplier_product_id uuid,
  p_case_cost numeric,
  p_effective_date date,
  p_source public.cost_source,
  p_invoice_line_id uuid default null
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
    (supplier_product_id, case_cost, unit_cost, effective_date, change_pct, source, invoice_line_id)
  values (
    p_supplier_product_id,
    p_case_cost,
    v_unit_cost,
    p_effective_date,
    case when v_latest.unit_cost > 0
      then round((v_unit_cost - v_latest.unit_cost) / v_latest.unit_cost * 100, 2)
    end,
    p_source,
    p_invoice_line_id
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Working on a delivery
-- ---------------------------------------------------------------------------

-- Locks a delivery that is about to change and checks the person may change
-- it: stock staff while it is a draft, owners and managers until it is posted.
create function private.editable_delivery(p_invoice_id uuid) returns public.supplier_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
begin
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That delivery does not exist.';
  end if;
  if v_invoice.status = 'posted' then
    raise exception 'This delivery has been posted and can no longer be changed.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'This delivery was voided and can no longer be changed.';
  end if;
  if private.has_role('owner', 'manager') then
    return v_invoice;
  end if;
  if private.has_role('staff') then
    if v_invoice.status = 'draft' then
      return v_invoice;
    end if;
    raise exception 'This delivery has been checked in. Ask a manager to change it.' using errcode = '42501';
  end if;
  raise exception 'You do not have permission to change deliveries.' using errcode = '42501';
end;
$$;

create function public.create_delivery(
  p_supplier_id uuid,
  p_delivered_at timestamptz,
  p_document_type public.document_type default 'invoice',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to record deliveries.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and active) then
    raise exception 'Choose an active supplier.';
  end if;
  if p_delivered_at is null or p_delivered_at > now() + interval '10 minutes' then
    raise exception 'The delivery time cannot be in the future.';
  end if;

  insert into public.supplier_invoices (store_id, supplier_id, document_type, delivered_at, notes)
  values (private.default_store_id(), p_supplier_id, p_document_type, p_delivered_at, nullif(btrim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_delivery_details(
  p_invoice_id uuid,
  p_delivered_at timestamptz,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.editable_delivery(p_invoice_id);
  if p_delivered_at is null or p_delivered_at > now() + interval '10 minutes' then
    raise exception 'The delivery time cannot be in the future.';
  end if;
  update public.supplier_invoices
  set delivered_at = p_delivered_at, notes = nullif(btrim(p_notes), '')
  where id = p_invoice_id;
end;
$$;

-- Adds cases of a product. Adding a product that is already on the delivery
-- (same case size) adds to that line, so scanning twice counts twice.
create function public.add_delivery_line(
  p_invoice_id uuid,
  p_product_id uuid,
  p_cases numeric default 1,
  p_units_per_case numeric default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
  v_product public.products;
  v_link public.supplier_products;
  v_units numeric;
  v_line_id uuid;
begin
  v_invoice := private.editable_delivery(p_invoice_id);

  select * into v_product from public.products where id = p_product_id and active;
  if not found then
    raise exception 'That product does not exist or is switched off.';
  end if;
  if p_cases is null or p_cases <= 0 or p_cases > 100000 then
    raise exception 'Enter how many cases, more than zero.';
  end if;
  if p_units_per_case is not null and p_units_per_case <= 0 then
    raise exception 'A case must hold more than zero units.';
  end if;

  select * into v_link
  from public.supplier_products
  where supplier_id = v_invoice.supplier_id and product_id = p_product_id and active
  order by (units_per_case = p_units_per_case) desc nulls last, is_preferred desc, created_at
  limit 1;

  v_units := coalesce(p_units_per_case, v_link.units_per_case, 1);

  update public.supplier_invoice_lines
  set cases_invoiced = cases_invoiced + p_cases,
      cases_received = cases_received + p_cases
  where invoice_id = p_invoice_id and line_kind = 'stock'
    and product_id = p_product_id and units_per_case = v_units
  returning id into v_line_id;
  if v_line_id is not null then
    return v_line_id;
  end if;

  insert into public.supplier_invoice_lines
    (invoice_id, line_number, line_kind, product_id, supplier_product_id, printed_code,
     printed_description, units_per_case, cases_invoiced, cases_received)
  values (
    p_invoice_id,
    coalesce((select max(line_number) from public.supplier_invoice_lines where invoice_id = p_invoice_id), 0) + 1,
    'stock',
    p_product_id,
    v_link.id,
    v_link.supplier_code,
    coalesce(v_link.supplier_description, left(concat_ws(' ', v_product.name, v_product.size), 200)),
    v_units,
    p_cases,
    p_cases
  )
  returning id into v_line_id;
  return v_line_id;
end;
$$;

-- Changes the quantities on a stock line. A difference between cases
-- invoiced and received is marked short or extra automatically.
create function public.update_delivery_line(
  p_line_id uuid,
  p_cases_invoiced numeric,
  p_cases_received numeric,
  p_units_per_case numeric,
  p_discrepancy public.discrepancy default 'none',
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.supplier_invoice_lines;
  v_invoice public.supplier_invoices;
  v_discrepancy public.discrepancy := coalesce(p_discrepancy, 'none');
begin
  select * into v_line from public.supplier_invoice_lines where id = p_line_id;
  if not found then
    raise exception 'That delivery line does not exist.';
  end if;
  v_invoice := private.editable_delivery(v_line.invoice_id);
  if v_line.line_kind <> 'stock' then
    raise exception 'Only product lines have quantities.';
  end if;
  if p_cases_invoiced is null or p_cases_received is null
     or p_cases_invoiced < 0 or p_cases_received < 0
     or p_cases_invoiced > 100000 or p_cases_received > 100000 then
    raise exception 'Cases must be zero or more.';
  end if;
  if p_units_per_case is null or p_units_per_case <= 0 then
    raise exception 'A case must hold more than zero units.';
  end if;

  if v_invoice.document_type = 'invoice' then
    if p_cases_received < p_cases_invoiced and v_discrepancy in ('none', 'extra') then
      v_discrepancy := 'short';
    elsif p_cases_received > p_cases_invoiced and v_discrepancy in ('none', 'short') then
      v_discrepancy := 'extra';
    elsif p_cases_received = p_cases_invoiced and v_discrepancy in ('short', 'extra') then
      v_discrepancy := 'none';
    end if;
  else
    v_discrepancy := 'none';
  end if;

  update public.supplier_invoice_lines
  set cases_invoiced = p_cases_invoiced,
      cases_received = p_cases_received,
      units_per_case = p_units_per_case,
      discrepancy = v_discrepancy,
      note = nullif(btrim(p_note), '')
  where id = p_line_id;
end;
$$;

create function public.remove_delivery_line(p_line_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
begin
  select invoice_id into v_invoice_id from public.supplier_invoice_lines where id = p_line_id;
  if not found then
    raise exception 'That delivery line does not exist.';
  end if;
  perform private.editable_delivery(v_invoice_id);
  delete from public.supplier_invoice_lines where id = p_line_id;
end;
$$;

-- A charge on the invoice that is not stock, such as delivery or a deposit.
create function public.add_delivery_charge(
  p_invoice_id uuid,
  p_description text,
  p_net_amount numeric,
  p_vat_rate_pct numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line_id uuid;
begin
  perform private.editable_delivery(p_invoice_id);
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can enter costs.' using errcode = '42501';
  end if;
  if nullif(btrim(p_description), '') is null then
    raise exception 'Describe the charge, for example "Delivery charge".';
  end if;
  if p_net_amount is null or p_net_amount < 0 then
    raise exception 'The amount must be zero or more.';
  end if;
  if p_vat_rate_pct is null or p_vat_rate_pct < 0 or p_vat_rate_pct > 100 then
    raise exception 'Choose a VAT rate.';
  end if;

  insert into public.supplier_invoice_lines
    (invoice_id, line_number, line_kind, printed_description, units_per_case, cases_invoiced, cases_received)
  values (
    p_invoice_id,
    coalesce((select max(line_number) from public.supplier_invoice_lines where invoice_id = p_invoice_id), 0) + 1,
    'non_stock',
    left(btrim(p_description), 200),
    1,
    0,
    0
  )
  returning id into v_line_id;

  insert into public.supplier_invoice_line_costs (line_id, net_amount, vat_rate_pct)
  values (v_line_id, p_net_amount, p_vat_rate_pct);
  return v_line_id;
end;
$$;

-- Staff have finished counting what arrived.
create function public.check_in_delivery(p_invoice_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
begin
  v_invoice := private.editable_delivery(p_invoice_id);
  if v_invoice.status <> 'draft' then
    raise exception 'This delivery has already been checked in.';
  end if;
  if not exists (
    select 1 from public.supplier_invoice_lines
    where invoice_id = p_invoice_id and line_kind = 'stock'
  ) then
    raise exception 'Add at least one product before finishing the check-in.';
  end if;
  update public.supplier_invoices
  set status = 'checked_in', checked_in_by = auth.uid(), checked_in_at = now()
  where id = p_invoice_id;
end;
$$;

create function public.add_delivery_file(
  p_invoice_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_size_bytes integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.delivery_status;
  v_id uuid;
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to add files.' using errcode = '42501';
  end if;
  select status into v_status from public.supplier_invoices where id = p_invoice_id;
  if not found then
    raise exception 'That delivery does not exist.';
  end if;
  if v_status = 'void' then
    raise exception 'This delivery was voided.';
  end if;
  if p_storage_path is null or position(p_invoice_id::text || '/' in p_storage_path) <> 1 then
    raise exception 'The file was stored in the wrong place.';
  end if;

  insert into public.supplier_invoice_files (invoice_id, storage_path, file_name, content_type, size_bytes)
  values (p_invoice_id, p_storage_path, left(p_file_name, 200), p_content_type, p_size_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

-- Saves the invoice number, date, totals and line costs. Can be saved
-- part-way and finished later; posting checks that everything is there.
-- p_lines: [{line_id, case_cost, vat_rate_pct}] — blank case_cost clears it.
create function public.save_delivery_costs(
  p_invoice_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_net_total numeric,
  p_vat_total numeric,
  p_gross_total numeric,
  p_lines jsonb default '[]'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_kind public.line_kind;
begin
  perform private.editable_delivery(p_invoice_id);
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can enter costs.' using errcode = '42501';
  end if;
  if p_invoice_date > private.london_today() then
    raise exception 'The invoice date cannot be in the future.';
  end if;
  if p_net_total < 0 or p_vat_total < 0 or p_gross_total < 0 then
    raise exception 'Totals cannot be negative.';
  end if;

  update public.supplier_invoices
  set invoice_number = nullif(btrim(p_invoice_number), ''), invoice_date = p_invoice_date
  where id = p_invoice_id;

  insert into public.supplier_invoice_totals (invoice_id, net_total, vat_total, gross_total)
  values (p_invoice_id, p_net_total, p_vat_total, p_gross_total)
  on conflict (invoice_id) do update set
    net_total = excluded.net_total,
    vat_total = excluded.vat_total,
    gross_total = excluded.gross_total,
    updated_at = now();

  for v_line in
    select * from jsonb_to_recordset(coalesce(p_lines, '[]'))
      as r (line_id uuid, case_cost numeric, net_amount numeric, vat_rate_pct numeric)
  loop
    select line_kind into v_kind
    from public.supplier_invoice_lines
    where id = v_line.line_id and invoice_id = p_invoice_id;
    if not found then
      raise exception 'A line does not belong to this delivery.';
    end if;
    if v_line.case_cost < 0 or v_line.net_amount < 0 then
      raise exception 'Costs cannot be negative.';
    end if;
    if v_line.vat_rate_pct is not null and (v_line.vat_rate_pct < 0 or v_line.vat_rate_pct > 100) then
      raise exception 'VAT rates must be between 0 and 100%%.';
    end if;

    if (v_kind = 'stock' and v_line.case_cost is null)
       or (v_kind = 'non_stock' and v_line.net_amount is null) then
      delete from public.supplier_invoice_line_costs where line_id = v_line.line_id;
    else
      insert into public.supplier_invoice_line_costs (line_id, case_cost, net_amount, vat_rate_pct)
      values (
        v_line.line_id,
        case when v_kind = 'stock' then v_line.case_cost end,
        case when v_kind = 'non_stock' then v_line.net_amount end,
        coalesce(v_line.vat_rate_pct, 0)
      )
      on conflict (line_id) do update set
        case_cost = excluded.case_cost,
        net_amount = excluded.net_amount,
        vat_rate_pct = excluded.vat_rate_pct,
        updated_at = now();
    end if;
  end loop;
end;
$$;

-- What still stops a delivery from being posted, in plain English.
create function private.delivery_problems_for(p_invoice public.supplier_invoices) returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problems text[] := array[]::text[];
  v_totals public.supplier_invoice_totals;
  v_lines_net numeric;
  v_missing integer;
  v_word text := case when p_invoice.document_type = 'invoice' then 'invoice' else 'credit note' end;
begin
  if p_invoice.status not in ('draft', 'checked_in') then
    return array[format('This delivery is %s.', replace(p_invoice.status::text, '_', ' '))];
  end if;
  if p_invoice.invoice_number is null then
    v_problems := v_problems || format('Enter the %s number.', v_word);
  end if;
  if p_invoice.invoice_date is null then
    v_problems := v_problems || format('Enter the %s date.', v_word);
  end if;
  if p_invoice.delivered_at > now() then
    v_problems := v_problems || 'The delivery time is in the future.'::text;
  end if;
  if not exists (
    select 1 from public.supplier_invoice_lines
    where invoice_id = p_invoice.id and line_kind = 'stock'
  ) then
    v_problems := v_problems || 'Add at least one product.'::text;
  end if;

  select count(*) into v_missing
  from public.supplier_invoice_lines l
  left join public.supplier_invoice_line_costs c on c.line_id = l.id
  where l.invoice_id = p_invoice.id
    and ((l.line_kind = 'stock' and c.case_cost is null)
      or (l.line_kind = 'non_stock' and c.net_amount is null));
  if v_missing > 0 then
    v_problems := v_problems || format('Enter the case cost for %s line(s).', v_missing);
  end if;

  select * into v_totals from public.supplier_invoice_totals where invoice_id = p_invoice.id;
  if v_totals.net_total is null or v_totals.vat_total is null or v_totals.gross_total is null then
    v_problems := v_problems || format('Enter the %s totals: before VAT, VAT and total.', v_word);
  else
    select coalesce(sum(case when l.line_kind = 'stock'
             then round(c.case_cost * l.cases_invoiced, 2)
             else round(c.net_amount, 2) end), 0)
    into v_lines_net
    from public.supplier_invoice_lines l
    join public.supplier_invoice_line_costs c on c.line_id = l.id
    where l.invoice_id = p_invoice.id;

    if abs(v_lines_net - v_totals.net_total) > 0.02 then
      v_problems := v_problems || format(
        'The lines add up to £%s before VAT, but the %s says £%s.',
        to_char(v_lines_net, 'FM999,999,990.00'), v_word,
        to_char(v_totals.net_total, 'FM999,999,990.00'));
    end if;
    if abs(v_totals.net_total + v_totals.vat_total - v_totals.gross_total) > 0.02 then
      v_problems := v_problems || 'Before VAT plus VAT does not equal the total.'::text;
    end if;
  end if;

  return v_problems;
end;
$$;

create function public.delivery_problems(p_invoice_id uuid) returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can post deliveries.' using errcode = '42501';
  end if;
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id;
  if not found then
    raise exception 'That delivery does not exist.';
  end if;
  return private.delivery_problems_for(v_invoice);
end;
$$;

-- Posts a delivery: adds (or, for a credit note, takes away) the stock,
-- dated when it arrived, records each supplier's case cost and locks it.
create function public.post_delivery(p_invoice_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
  v_problems text[];
  v_line record;
  v_link public.supplier_products;
  v_unit_cost numeric;
  v_movements integer := 0;
  v_units numeric := 0;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can post deliveries.' using errcode = '42501';
  end if;
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That delivery does not exist.';
  end if;

  v_problems := private.delivery_problems_for(v_invoice);
  if cardinality(v_problems) > 0 then
    raise exception '%', array_to_string(v_problems, ' ');
  end if;

  for v_line in
    select l.*, c.case_cost
    from public.supplier_invoice_lines l
    join public.supplier_invoice_line_costs c on c.line_id = l.id
    where l.invoice_id = p_invoice_id and l.line_kind = 'stock'
    order by l.line_number
  loop
    v_unit_cost := round(v_line.case_cost / v_line.units_per_case, 4);

    if v_line.units_received > 0 then
      perform private.apply_movement(
        v_invoice.store_id,
        v_line.product_id,
        case when v_invoice.document_type = 'invoice' then 'receipt' else 'supplier_return' end::public.movement_type,
        case when v_invoice.document_type = 'invoice' then v_line.units_received else -v_line.units_received end,
        v_unit_cost,
        v_invoice.delivered_at,
        'delivery_line',
        v_line.id
      );
      v_movements := v_movements + 1;
      v_units := v_units + v_line.units_received;
    end if;

    -- Invoices teach us the supplier's latest case cost (credit notes do not).
    if v_invoice.document_type = 'invoice' then
      v_link := null;
      if v_line.supplier_product_id is not null then
        select * into v_link from public.supplier_products where id = v_line.supplier_product_id;
      end if;
      if v_link.id is null or not v_link.active then
        select * into v_link
        from public.supplier_products
        where supplier_id = v_invoice.supplier_id and product_id = v_line.product_id and active
        order by (units_per_case = v_line.units_per_case) desc, is_preferred desc, created_at
        limit 1;
      end if;
      if v_link.id is null then
        -- First time from this supplier: remember the product for next time.
        insert into public.supplier_products
          (supplier_id, product_id, supplier_code, supplier_description, units_per_case, is_preferred)
        values (
          v_invoice.supplier_id,
          v_line.product_id,
          case when v_line.printed_code is not null and not exists (
            select 1 from public.supplier_products x
            where x.supplier_id = v_invoice.supplier_id and x.active
              and upper(x.supplier_code) = upper(v_line.printed_code)
          ) then v_line.printed_code end,
          v_line.printed_description,
          v_line.units_per_case,
          not exists (
            select 1 from public.supplier_products x
            where x.product_id = v_line.product_id and x.is_preferred and x.active
          )
        )
        returning * into v_link;
      elsif v_link.units_per_case <> v_line.units_per_case then
        -- The supplier's case size has changed.
        update public.supplier_products set units_per_case = v_line.units_per_case where id = v_link.id;
      end if;

      update public.supplier_invoice_lines set supplier_product_id = v_link.id where id = v_line.id;
      perform private.insert_supplier_cost(
        v_link.id, v_line.case_cost, v_invoice.invoice_date, 'invoice', v_line.id);
    end if;
  end loop;

  update public.supplier_invoices
  set status = 'posted',
      posted_by = auth.uid(),
      posted_at = now(),
      checked_in_by = coalesce(checked_in_by, auth.uid()),
      checked_in_at = coalesce(checked_in_at, now())
  where id = p_invoice_id;

  return jsonb_build_object('movements', v_movements, 'units', v_units);
end;
$$;

-- Cancels a delivery. If it was posted, its stock movements are reversed
-- (dated at the original time) and the costs it recorded are removed.
create function public.void_delivery(p_invoice_id uuid, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.supplier_invoices;
  v_movement record;
begin
  if not private.has_role('owner') then
    raise exception 'Only owners can void deliveries.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the delivery is being voided.';
  end if;
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'That delivery does not exist.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'This delivery was already voided.';
  end if;

  if v_invoice.status = 'posted' then
    for v_movement in
      select m.id
      from public.stock_movements m
      join public.supplier_invoice_lines l on l.id = m.source_id
      where m.source_type = 'delivery_line' and l.invoice_id = p_invoice_id
        and m.movement_type in ('receipt', 'supplier_return')
    loop
      perform private.reverse_movement(v_movement.id, 'Delivery voided: ' || btrim(p_reason));
    end loop;

    delete from public.supplier_cost_history
    where invoice_line_id in (
      select id from public.supplier_invoice_lines where invoice_id = p_invoice_id
    );
  end if;

  update public.supplier_invoices
  set status = 'void', voided_by = auth.uid(), voided_at = now(), void_reason = left(btrim(p_reason), 300)
  where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- File storage: photos and PDFs of delivery paperwork
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-files',
  'delivery-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Staff photograph the paperwork; only cost viewers can open it again,
-- because invoices show prices.
create policy "Staff, managers and owners can upload delivery files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'delivery-files' and (select private.has_role('owner', 'manager', 'staff'))
);

create policy "Owners, managers and viewers can open delivery files"
on storage.objects for select to authenticated
using (bucket_id = 'delivery-files' and (select private.can_see_costs()));

-- ---------------------------------------------------------------------------
-- Audit and Row Level Security
-- ---------------------------------------------------------------------------

create trigger supplier_invoices_audit after insert or update or delete on public.supplier_invoices
for each row execute function private.audit();
create trigger supplier_invoice_totals_audit after insert or update or delete on public.supplier_invoice_totals
for each row execute function private.audit();
create trigger supplier_invoice_lines_audit after insert or update or delete on public.supplier_invoice_lines
for each row execute function private.audit();
create trigger supplier_invoice_line_costs_audit after insert or update or delete on public.supplier_invoice_line_costs
for each row execute function private.audit();

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_totals enable row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.supplier_invoice_line_costs enable row level security;
alter table public.supplier_invoice_files enable row level security;

create policy "Active users can read deliveries"
on public.supplier_invoices for select to authenticated
using ((select private.is_active_user()));

create policy "Owners, managers and viewers can read invoice totals"
on public.supplier_invoice_totals for select to authenticated
using ((select private.can_see_costs()));

create policy "Active users can read delivery lines"
on public.supplier_invoice_lines for select to authenticated
using ((select private.is_active_user()));

create policy "Owners, managers and viewers can read line costs"
on public.supplier_invoice_line_costs for select to authenticated
using ((select private.can_see_costs()));

create policy "Active users can read delivery files"
on public.supplier_invoice_files for select to authenticated
using ((select private.is_active_user()));

-- Deliveries change only through the functions above.
revoke insert, update, delete, truncate, references, trigger on
  public.supplier_invoices, public.supplier_invoice_totals, public.supplier_invoice_lines,
  public.supplier_invoice_line_costs, public.supplier_invoice_files, public.delivery_overview
from authenticated;
revoke all on
  public.supplier_invoices, public.supplier_invoice_totals, public.supplier_invoice_lines,
  public.supplier_invoice_line_costs, public.supplier_invoice_files, public.delivery_overview
from anon;

revoke execute on function
  private.insert_supplier_cost(uuid, numeric, date, public.cost_source, uuid),
  private.editable_delivery(uuid),
  private.delivery_problems_for(public.supplier_invoices)
from public, anon, authenticated;

revoke execute on function
  public.create_delivery(uuid, timestamptz, public.document_type, text),
  public.update_delivery_details(uuid, timestamptz, text),
  public.add_delivery_line(uuid, uuid, numeric, numeric),
  public.update_delivery_line(uuid, numeric, numeric, numeric, public.discrepancy, text),
  public.remove_delivery_line(uuid),
  public.add_delivery_charge(uuid, text, numeric, numeric),
  public.check_in_delivery(uuid),
  public.add_delivery_file(uuid, text, text, text, integer),
  public.save_delivery_costs(uuid, text, date, numeric, numeric, numeric, jsonb),
  public.delivery_problems(uuid),
  public.post_delivery(uuid),
  public.void_delivery(uuid, text)
from public, anon;

grant execute on function
  public.create_delivery(uuid, timestamptz, public.document_type, text),
  public.update_delivery_details(uuid, timestamptz, text),
  public.add_delivery_line(uuid, uuid, numeric, numeric),
  public.update_delivery_line(uuid, numeric, numeric, numeric, public.discrepancy, text),
  public.remove_delivery_line(uuid),
  public.add_delivery_charge(uuid, text, numeric, numeric),
  public.check_in_delivery(uuid),
  public.add_delivery_file(uuid, text, text, text, integer),
  public.save_delivery_costs(uuid, text, date, numeric, numeric, numeric, jsonb),
  public.delivery_problems(uuid),
  public.post_delivery(uuid),
  public.void_delivery(uuid, text)
to authenticated;
