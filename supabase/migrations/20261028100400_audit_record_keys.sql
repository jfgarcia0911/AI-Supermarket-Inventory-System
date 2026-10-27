-- The audit log names each changed row by its key. The delivery cost tables
-- are keyed by the invoice or line they belong to (invoice_id, line_id), not
-- by an id column, so writing their totals or line costs failed. Look for
-- those keys too.

create or replace function private.audit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  -- Skip updates that changed nothing but the timestamp.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  insert into public.audit_log
    (table_name, record_id, action, old_values, new_values, changed_by)
  values (
    tg_table_name,
    coalesce(
      v_new ->> 'id', v_old ->> 'id',
      v_new ->> 'code', v_old ->> 'code',
      v_new ->> 'key', v_old ->> 'key',
      v_new ->> 'invoice_id', v_old ->> 'invoice_id',
      v_new ->> 'line_id', v_old ->> 'line_id'
    ),
    lower(tg_op),
    v_old,
    v_new,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;
