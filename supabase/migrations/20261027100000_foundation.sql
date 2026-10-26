-- Foundation: roles, people, stores, settings, VAT rates and the audit log.
--
-- Security model (see docs/detailed-design.html, "Users and permissions"):
-- every table has Row Level Security; helper functions below read the
-- signed-in user's role from public.profiles. Anything that must stay
-- consistent (imports, cost history, user administration) is done by
-- security-definer functions that check the role themselves.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('owner', 'manager', 'staff', 'viewer');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.london_today() returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/London')::date
$$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 100),
  email text not null,
  role public.app_role not null default 'staff',
  active boolean not null default true,
  -- New accounts get a temporary password and must choose their own.
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create trigger profiles_set_updated_at
before update on public.profiles
for each row when (old is distinct from new)
execute function private.set_updated_at();

-- Role helpers used by Row Level Security policies.
create function private.current_app_role() returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create function private.has_role(variadic roles public.app_role[]) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (roles), false)
$$;

create function private.is_active_user() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
$$;

-- Owners, managers and viewers may see cost prices; stock staff may not.
create function private.can_see_costs() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('owner', 'manager', 'viewer')
$$;

-- There must always be at least one active owner.
create function private.keep_an_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active)
     and not exists (
       select 1 from public.profiles
       where role = 'owner' and active and id <> old.id
     ) then
    raise exception 'There must always be at least one active owner.';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_an_owner
before update on public.profiles
for each row execute function private.keep_an_owner();

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  address text check (length(address) <= 300),
  timezone text not null default 'Europe/London',
  -- Daily till sales are dated at this time of day.
  trading_day_end time not null default '22:00',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now()
);

create trigger stores_set_updated_at
before update on public.stores
for each row when (old is distinct from new)
execute function private.set_updated_at();

create table public.store_members (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, store_id)
);

create index store_members_store_idx on public.store_members (store_id);

insert into public.stores (name) values ('Main store');

-- New sign-in accounts are created by an owner through the admin API. The
-- role and display name travel in the account's metadata; users cannot set
-- app metadata themselves, so a self-made account would only ever be staff.
create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, must_change_password)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'staff'),
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, true)
  );

  -- One store for now: everyone works in every active store.
  insert into public.store_members (profile_id, store_id)
  select new.id, s.id from public.stores s where s.active;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.handle_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Settings and VAT rates
-- ---------------------------------------------------------------------------

create table public.settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
before update on public.settings
for each row when (old is distinct from new)
execute function private.set_updated_at();

insert into public.settings (key, value, description) values
  ('adjustment_approval_units', '20',
   'Adjustments larger than this many units need a manager''s approval.'),
  ('adjustment_approval_value', '25',
   'Adjustments worth more than this (£ at cost) need a manager''s approval.'),
  ('recount_units', '20',
   'Count differences larger than this many units are flagged for a recount.'),
  ('recount_value', '25',
   'Count differences worth more than this (£ at cost) are flagged for a recount.'),
  ('unposted_delivery_hours', '24',
   'Deliveries left unposted for longer than this raise an alert.');

create table public.vat_rates (
  code text primary key check (code ~ '^[A-Z]$'),
  name text not null,
  rate_pct numeric(5, 2) not null check (rate_pct >= 0 and rate_pct < 100),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger vat_rates_set_updated_at
before update on public.vat_rates
for each row when (old is distinct from new)
execute function private.set_updated_at();

insert into public.vat_rates (code, name, rate_pct) values
  ('Z', 'Zero', 0),
  ('R', 'Reduced', 5),
  ('S', 'Standard', 20);

-- ---------------------------------------------------------------------------
-- Audit log: written automatically by triggers, never by the app.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index audit_log_record_idx
  on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

create function private.audit() returns trigger
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
      v_new ->> 'key', v_old ->> 'key'
    ),
    lower(tg_op),
    v_old,
    v_new,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function private.audit();
create trigger stores_audit after insert or update or delete on public.stores
for each row execute function private.audit();
create trigger settings_audit after insert or update or delete on public.settings
for each row execute function private.audit();
create trigger vat_rates_audit after insert or update or delete on public.vat_rates
for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.settings enable row level security;
alter table public.vat_rates enable row level security;
alter table public.audit_log enable row level security;

-- Profiles change only through the user-administration functions.
create policy "Active users can read profiles"
on public.profiles for select to authenticated
using ((select private.is_active_user()) or id = (select auth.uid()));

create policy "Active users can read stores"
on public.stores for select to authenticated
using ((select private.is_active_user()));

create policy "Owners can add stores"
on public.stores for insert to authenticated
with check ((select private.has_role('owner')));

create policy "Owners can update stores"
on public.stores for update to authenticated
using ((select private.has_role('owner')))
with check ((select private.has_role('owner')));

create policy "Users can read their own store memberships"
on public.store_members for select to authenticated
using (profile_id = (select auth.uid()) or (select private.has_role('owner')));

create policy "Owners can add store members"
on public.store_members for insert to authenticated
with check ((select private.has_role('owner')));

create policy "Owners can remove store members"
on public.store_members for delete to authenticated
using ((select private.has_role('owner')));

create policy "Active users can read settings"
on public.settings for select to authenticated
using ((select private.is_active_user()));

create policy "Owners can change settings"
on public.settings for update to authenticated
using ((select private.has_role('owner')))
with check ((select private.has_role('owner')));

create policy "Active users can read VAT rates"
on public.vat_rates for select to authenticated
using ((select private.is_active_user()));

create policy "Owners can change VAT rates"
on public.vat_rates for update to authenticated
using ((select private.has_role('owner')))
with check ((select private.has_role('owner')));

create policy "Owners and managers can read the audit log"
on public.audit_log for select to authenticated
using ((select private.has_role('owner', 'manager')));
