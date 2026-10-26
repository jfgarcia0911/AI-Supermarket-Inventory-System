-- User administration and API privileges.
--
-- Sign-in accounts are created by an owner through the app's server code
-- (Supabase admin API). Roles and the active flag change only through the
-- functions below, which check that the caller is an owner.

create function public.set_user_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner') then
    raise exception 'Only owners can change roles.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role. Ask another owner.';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'That user does not exist.';
  end if;
end;
$$;

create function public.set_user_active(p_user_id uuid, p_active boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('owner') then
    raise exception 'Only owners can switch users on or off.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot switch off your own account.';
  end if;
  update public.profiles set active = p_active where id = p_user_id;
  if not found then
    raise exception 'That user does not exist.';
  end if;
end;
$$;

create function public.update_my_name(p_full_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Your account is switched off.' using errcode = '42501';
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = auth.uid();
end;
$$;

-- Called after the user has chosen their own password.
create function public.mark_password_changed() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set must_change_password = false where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Row Level Security decides which rows each role may read or change. On top
-- of that: the anonymous (signed-out) role gets nothing, and nobody deletes
-- or truncates rows through the API. Records are switched off, not deleted.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger, delete on all tables in schema public from authenticated;
grant delete on public.store_members to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.current_app_role(),
  private.has_role(public.app_role[]),
  private.is_active_user(),
  private.can_see_costs(),
  private.is_valid_gtin(text),
  private.london_today()
to authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
