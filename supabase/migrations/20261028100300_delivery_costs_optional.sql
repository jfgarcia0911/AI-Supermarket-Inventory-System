-- save_delivery_costs: a manager can save part-way (for example before the
-- totals are known), so every argument after the delivery is optional.

drop function public.save_delivery_costs(uuid, text, date, numeric, numeric, numeric, jsonb);

create function public.save_delivery_costs(
  p_invoice_id uuid,
  p_invoice_number text default null,
  p_invoice_date date default null,
  p_net_total numeric default null,
  p_vat_total numeric default null,
  p_gross_total numeric default null,
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

revoke execute on function
  public.save_delivery_costs(uuid, text, date, numeric, numeric, numeric, jsonb)
from public, anon;
grant execute on function
  public.save_delivery_costs(uuid, text, date, numeric, numeric, numeric, jsonb)
to authenticated;
