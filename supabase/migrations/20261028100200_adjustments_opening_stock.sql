-- Stock adjustments (waste, damage, found stock, corrections) with manager
-- approval above the limits in Settings, and the opening stock that gives
-- every product its starting quantity.

create type public.adjustment_status as enum ('auto_approved', 'pending', 'approved', 'rejected');

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  product_id uuid not null references public.products (id),
  -- Single items or kg: − for stock going out, + for stock found.
  quantity numeric(12, 3) not null check (quantity <> 0),
  reason_id uuid not null references public.adjustment_reasons (id),
  note text check (length(note) <= 500),
  status public.adjustment_status not null,
  requested_by uuid default auth.uid() references public.profiles (id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 300),
  movement_id uuid references public.stock_movements (id),
  created_at timestamptz not null default now()
);

create index stock_adjustments_status_idx on public.stock_adjustments (status, requested_at desc);
create index stock_adjustments_product_idx on public.stock_adjustments (product_id, requested_at desc);

create trigger stock_adjustments_audit after insert or update or delete on public.stock_adjustments
for each row execute function private.audit();

alter table public.stock_adjustments enable row level security;

create policy "Active users can read adjustments"
on public.stock_adjustments for select to authenticated
using ((select private.is_active_user()));

revoke insert, update, delete, truncate, references, trigger on public.stock_adjustments from authenticated;
revoke all on public.stock_adjustments from anon;

create function private.setting_number(p_key text) returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::numeric from public.settings where key = p_key
$$;

-- Records an adjustment. Stock staff need a manager's approval when it is
-- bigger than the limits in Settings (units, or value at average cost);
-- owners' and managers' adjustments go straight through.
create function public.request_adjustment(
  p_product_id uuid,
  p_quantity numeric,
  p_reason_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason public.adjustment_reasons;
  v_store uuid := private.default_store_id();
  v_average numeric;
  v_needs_approval boolean;
  v_id uuid;
  v_movement uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if not private.has_role('owner', 'manager', 'staff') then
    raise exception 'You do not have permission to adjust stock.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and active) then
    raise exception 'That product does not exist or is switched off.';
  end if;
  if p_quantity is null or p_quantity = 0 or abs(p_quantity) > 100000 then
    raise exception 'Enter a quantity other than zero.';
  end if;

  select * into v_reason from public.adjustment_reasons where id = p_reason_id and active;
  if not found then
    raise exception 'Choose a reason.';
  end if;
  if v_reason.direction = 'decrease' and p_quantity > 0 then
    raise exception '"%" takes stock away, so the quantity must be negative.', v_reason.name;
  end if;
  if v_reason.direction = 'increase' and p_quantity < 0 then
    raise exception '"%" adds stock, so the quantity must be positive.', v_reason.name;
  end if;
  if v_reason.note_required and v_note is null then
    raise exception 'Add a note explaining the %.', lower(v_reason.name);
  end if;

  select average_unit_cost into v_average
  from public.stock_costs where store_id = v_store and product_id = p_product_id;

  v_needs_approval := not private.has_role('owner', 'manager') and (
    abs(p_quantity) > coalesce(private.setting_number('adjustment_approval_units'), 20)
    or abs(p_quantity) * coalesce(v_average, 0) > coalesce(private.setting_number('adjustment_approval_value'), 25)
  );

  insert into public.stock_adjustments
    (store_id, product_id, quantity, reason_id, note, status, decided_by, decided_at)
  values (
    v_store, p_product_id, p_quantity, p_reason_id, v_note,
    case when v_needs_approval then 'pending' else 'auto_approved' end::public.adjustment_status,
    case when v_needs_approval then null else auth.uid() end,
    case when v_needs_approval then null else now() end
  )
  returning id into v_id;

  if not v_needs_approval then
    v_movement := private.apply_movement(
      v_store, p_product_id, 'adjustment', p_quantity, v_average, now(),
      'adjustment', v_id, p_reason_id, v_note);
    update public.stock_adjustments set movement_id = v_movement where id = v_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_needs_approval then 'pending' else 'auto_approved' end,
    'movement_id', v_movement
  );
end;
$$;

-- A manager approves (the stock changes, dated when it was recorded) or
-- rejects a pending adjustment.
create function public.decide_adjustment(
  p_adjustment_id uuid,
  p_approve boolean,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adjustment public.stock_adjustments;
  v_average numeric;
  v_movement uuid;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can approve adjustments.' using errcode = '42501';
  end if;
  select * into v_adjustment from public.stock_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'That adjustment does not exist.';
  end if;
  if v_adjustment.status <> 'pending' then
    raise exception 'That adjustment has already been decided.';
  end if;

  if p_approve then
    select average_unit_cost into v_average
    from public.stock_costs
    where store_id = v_adjustment.store_id and product_id = v_adjustment.product_id;

    v_movement := private.apply_movement(
      v_adjustment.store_id, v_adjustment.product_id, 'adjustment', v_adjustment.quantity,
      v_average, v_adjustment.requested_at, 'adjustment', v_adjustment.id,
      v_adjustment.reason_id, v_adjustment.note);
  end if;

  update public.stock_adjustments
  set status = case when p_approve then 'approved' else 'rejected' end::public.adjustment_status,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = nullif(btrim(p_note), ''),
      movement_id = v_movement
  where id = p_adjustment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening stock
-- ---------------------------------------------------------------------------
-- p_rows: [{row_number, product_id, product_code, quantity, unit_cost}]
-- product_code is any barcode of the product, or its till code (product_id
-- can be given instead). quantity is what was counted at p_as_of, in single
-- items or kg. The movement is the difference from the ledger at that moment,
-- so anything already recorded before the count is taken into account.
-- unit_cost (ex VAT) is optional: the preferred supplier's latest cost is used
-- otherwise, to start the average cost. Same preview / real modes as the
-- other imports. Each product can be given opening stock once; after that,
-- corrections are adjustments (or, later, counts).

create function public.import_opening_stock(
  p_rows jsonb,
  p_as_of timestamptz,
  p_file_name text default null,
  p_fingerprint text default null,
  p_mapping jsonb default '{}',
  p_rows_skipped integer default 0,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := private.default_store_id();
  v_errors integer;
  v_valid integer;
  v_import_id uuid;
  v_row record;
  v_delta numeric;
  v_set integer := 0;
  v_units numeric := 0;
  v_result jsonb;
begin
  if not private.has_role('owner', 'manager') then
    raise exception 'Only owners and managers can set opening stock.' using errcode = '42501';
  end if;
  if p_as_of is null or p_as_of > now() + interval '10 minutes' then
    raise exception 'Choose when the stock was counted. It cannot be in the future.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'A file can have at most 20,000 rows. Split it into smaller files.';
  end if;

  drop table if exists pg_temp.import_rows;
  create temporary table import_rows on commit drop as
  select
    r.row_number,
    r.product_id,
    nullif(btrim(r.product_code), '') as product_code,
    r.quantity,
    r.unit_cost,
    null::text as error
  from jsonb_to_recordset(p_rows) as r (
    row_number integer, product_id uuid, product_code text, quantity numeric, unit_cost numeric
  );

  update pg_temp.import_rows set error = 'The barcode or till code is missing.'
  where product_id is null and product_code is null;
  update pg_temp.import_rows set error = 'The quantity counted is missing.'
  where error is null and quantity is null;
  update pg_temp.import_rows set error = 'The quantity counted cannot be negative.'
  where error is null and quantity < 0;
  update pg_temp.import_rows set error = 'The quantity counted is too large.'
  where error is null and quantity > 1000000;
  update pg_temp.import_rows set error = 'The unit cost cannot be negative.'
  where error is null and unit_cost < 0;

  -- Our product: any active barcode (unit or case), otherwise the till code.
  update pg_temp.import_rows r set product_id = b.product_id
  from public.product_barcodes b
  where r.error is null and r.product_id is null and b.active and b.barcode = r.product_code;

  update pg_temp.import_rows r set product_id = p.id
  from public.products p
  where r.error is null and r.product_id is null and p.active and p.till_code = upper(r.product_code);

  update pg_temp.import_rows r
  set error = format('No product has barcode or till code %s.', coalesce(r.product_code, ''))
  where r.error is null
    and not exists (select 1 from public.products p where p.id = r.product_id and p.active);

  with repeated as (
    select product_id from pg_temp.import_rows
    where error is null group by product_id having count(*) > 1
  )
  update pg_temp.import_rows set error = 'This product appears more than once in the file.'
  where error is null and product_id in (select product_id from repeated);

  update pg_temp.import_rows r
  set error = 'This product already has opening stock. Correct it with an adjustment.'
  from public.stock_levels l
  where r.error is null and l.store_id = v_store and l.product_id = r.product_id
    and l.last_counted_at is not null;

  select count(*) filter (where error is not null), count(*) filter (where error is null)
  into v_errors, v_valid
  from pg_temp.import_rows;

  if not p_dry_run and v_errors > 0 then
    raise exception 'The file now has % row(s) with problems. Check it again before importing.', v_errors;
  end if;
  if not p_dry_run and v_valid = 0 then
    raise exception 'There is nothing to import.';
  end if;

  begin
    if p_file_name is not null then
      insert into public.imports
        (import_type, store_id, file_name, file_fingerprint, column_mapping, rows_total, rows_ok, rows_error)
      values (
        'opening_stock', v_store, p_file_name, p_fingerprint, coalesce(p_mapping, '{}'),
        v_valid + v_errors + p_rows_skipped, v_valid, v_errors + p_rows_skipped
      )
      returning id into v_import_id;
    end if;

    for v_row in
      select r.*, (
        select lc.unit_cost
        from public.supplier_products sp
        join public.supplier_product_latest_costs lc on lc.supplier_product_id = sp.id
        where sp.product_id = r.product_id and sp.active
        order by sp.is_preferred desc, lc.effective_date desc
        limit 1
      ) as supplier_unit_cost
      from pg_temp.import_rows r
      where r.error is null
      order by r.row_number
    loop
      v_delta := v_row.quantity - private.stock_balance_as_of(v_store, v_row.product_id, p_as_of);
      if v_delta <> 0 then
        perform private.apply_movement(
          v_store, v_row.product_id, 'opening_balance', v_delta,
          coalesce(v_row.unit_cost, v_row.supplier_unit_cost), p_as_of,
          'opening_stock', v_import_id, null, 'Opening stock');
      else
        -- Nothing to add (counted the same as recorded), but it has been counted.
        insert into public.stock_levels (store_id, product_id, last_counted_at)
        values (v_store, v_row.product_id, p_as_of)
        on conflict (store_id, product_id) do update set last_counted_at = excluded.last_counted_at;
      end if;
      v_set := v_set + 1;
      v_units := v_units + v_row.quantity;
    end loop;

    select jsonb_build_object(
      'rows', count(*) + p_rows_skipped,
      'valid', count(*) filter (where error is null),
      'skipped', p_rows_skipped,
      'products_set', v_set,
      'units_counted', v_units,
      'errors', coalesce(
        jsonb_agg(jsonb_build_object('row', row_number, 'message', error) order by row_number)
          filter (where error is not null),
        '[]'::jsonb)
    )
    into v_result
    from pg_temp.import_rows;

    if p_dry_run then
      raise sqlstate 'DRY01';
    end if;

    if v_import_id is not null then
      update public.imports set summary = v_result - 'errors' where id = v_import_id;
      v_result := v_result || jsonb_build_object('import_id', v_import_id);
    end if;
  exception
    when sqlstate 'DRY01' then
      null; -- Preview only: everything above is undone, the summary is kept.
  end;

  return v_result;
end;
$$;

revoke execute on function private.setting_number(text) from public, anon, authenticated;

revoke execute on function
  public.request_adjustment(uuid, numeric, uuid, text),
  public.decide_adjustment(uuid, boolean, text),
  public.import_opening_stock(jsonb, timestamptz, text, text, jsonb, integer, boolean)
from public, anon;

grant execute on function
  public.request_adjustment(uuid, numeric, uuid, text),
  public.decide_adjustment(uuid, boolean, text),
  public.import_opening_stock(jsonb, timestamptz, text, text, jsonb, integer, boolean)
to authenticated;
