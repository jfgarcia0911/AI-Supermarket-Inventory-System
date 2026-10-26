-- Helpers that make multi-step catalogue changes from the app happen in one
-- transaction. They run as the caller (security invoker), so Row Level
-- Security still decides who may make each change.

-- A new product and, optionally, its main barcode.
create function public.create_product(
  p_name text,
  p_category_id uuid,
  p_vat_code text,
  p_brand text default null,
  p_size text default null,
  p_sold_by public.sold_by default 'each',
  p_sell_price numeric default null,
  p_reorder_point numeric default null,
  p_reorder_qty numeric default null,
  p_till_code text default null,
  p_barcode text default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.products
    (name, brand, size, category_id, sold_by, vat_code, sell_price,
     reorder_point, reorder_qty, till_code)
  values (
    btrim(p_name),
    nullif(btrim(p_brand), ''),
    nullif(btrim(p_size), ''),
    p_category_id,
    p_sold_by,
    p_vat_code,
    p_sell_price,
    p_reorder_point,
    p_reorder_qty,
    nullif(upper(btrim(p_till_code)), '')
  )
  returning id into v_id;

  if nullif(btrim(p_barcode), '') is not null then
    insert into public.product_barcodes (product_id, barcode, pack_type, units_per_pack, is_primary)
    values (v_id, btrim(p_barcode), 'unit', 1, true);
  end if;

  return v_id;
end;
$$;

-- Makes one single-item barcode the product's main barcode.
create function public.set_primary_barcode(p_barcode_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  select product_id into v_product_id
  from public.product_barcodes
  where id = p_barcode_id and active and pack_type = 'unit';
  if not found then
    raise exception 'Only an active single-item barcode can be the main barcode.';
  end if;

  update public.product_barcodes set is_primary = false
  where product_id = v_product_id and is_primary and id <> p_barcode_id;

  update public.product_barcodes set is_primary = true where id = p_barcode_id;
  if not found then
    raise exception 'You do not have permission to change barcodes.' using errcode = '42501';
  end if;
end;
$$;

-- Adds or changes a supplier's code for one of our products. Marking it as
-- preferred takes the flag away from the product's other suppliers.
create function public.save_supplier_product(
  p_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_supplier_code text,
  p_description text,
  p_units_per_case numeric,
  p_preferred boolean
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if p_preferred then
    update public.supplier_products set is_preferred = false
    where product_id = p_product_id and is_preferred and id is distinct from p_id;
  end if;

  if v_id is null then
    insert into public.supplier_products
      (supplier_id, product_id, supplier_code, supplier_description, units_per_case, is_preferred)
    values (
      p_supplier_id,
      p_product_id,
      nullif(btrim(p_supplier_code), ''),
      nullif(btrim(p_description), ''),
      p_units_per_case,
      p_preferred
    )
    returning id into v_id;
  else
    update public.supplier_products set
      product_id = p_product_id,
      supplier_code = nullif(btrim(p_supplier_code), ''),
      supplier_description = nullif(btrim(p_description), ''),
      units_per_case = p_units_per_case,
      is_preferred = p_preferred
    where id = p_id and supplier_id = p_supplier_id;
    if not found then
      raise exception 'That supplier product does not exist, or you cannot change it.';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function
  public.create_product(text, uuid, text, text, text, public.sold_by, numeric, numeric, numeric, text, text),
  public.set_primary_barcode(uuid),
  public.save_supplier_product(uuid, uuid, uuid, text, text, numeric, boolean)
from public, anon;

grant execute on function
  public.create_product(text, uuid, text, text, text, public.sold_by, numeric, numeric, numeric, text, text),
  public.set_primary_barcode(uuid),
  public.save_supplier_product(uuid, uuid, uuid, text, text, numeric, boolean)
to authenticated, service_role;
