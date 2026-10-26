-- List views with product counts, so the app never has to count rows itself
-- (the API returns at most 1,000 rows per request). Read-only, and they run
-- as the caller, so Row Level Security applies.

create view public.category_overview
with (security_invoker = true)
as
select
  cp.id,
  cp.name,
  cp.parent_id,
  cp.path,
  cp.depth,
  cp.active,
  c.target_margin_pct,
  c.expiry_warning_days,
  (
    select count(*) from public.products p
    where p.category_id = cp.id and p.active
  )::integer as product_count
from public.category_paths cp
join public.categories c on c.id = cp.id;

create view public.supplier_overview
with (security_invoker = true)
as
select
  s.id,
  s.name,
  s.account_number,
  s.contact_name,
  s.phone,
  s.email,
  s.payment_terms_days,
  s.delivery_days,
  s.lead_time_days,
  s.notes,
  s.active,
  (
    select count(*) from public.supplier_products sp
    where sp.supplier_id = s.id and sp.active
  )::integer as product_count
from public.suppliers s;

revoke insert, update, delete on
  public.category_overview,
  public.supplier_overview,
  public.category_paths,
  public.product_overview,
  public.supplier_product_latest_costs
from authenticated;
