-- save_supplier_product: the id is only known when editing, so it moves to
-- the end of the argument list with a default of null (= add a new one).

drop function public.save_supplier_product(uuid, uuid, uuid, text, text, numeric, boolean);

create function public.save_supplier_product(
  p_supplier_id uuid,
  p_product_id uuid,
  p_supplier_code text,
  p_description text,
  p_units_per_case numeric,
  p_preferred boolean,
  p_id uuid default null
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
  public.save_supplier_product(uuid, uuid, text, text, numeric, boolean, uuid)
from public, anon;

grant execute on function
  public.save_supplier_product(uuid, uuid, text, text, numeric, boolean, uuid)
to authenticated, service_role;
