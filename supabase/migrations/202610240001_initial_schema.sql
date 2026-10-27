create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  phone_encrypted text,
  phone_search_hash text unique,
  global_role text not null default 'CUSTOMER' check (global_role in ('CUSTOMER','PLATFORM_ADMIN')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.franchises (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  status text not null default 'TRIAL' check (status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')),
  email text not null, phone_encrypted text, registration_number text, logo_url text,
  owner_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(), franchise_id uuid not null references public.franchises(id) on delete cascade,
  name text not null, slug text not null, email text not null, phone_encrypted text, address text not null, county text not null,
  latitude numeric(10,7), longitude numeric(10,7), timezone text not null default 'Africa/Nairobi',
  booking_capacity integer not null default 8 check (booking_capacity > 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(franchise_id, slug)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  franchise_id uuid not null references public.franchises(id) on delete cascade, shop_id uuid references public.shops(id) on delete cascade,
  role text not null check (role in ('FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','MECHANIC','INVENTORY_CLERK','ACCOUNTANT')),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index memberships_unique_scope on public.memberships(user_id, franchise_id, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), role);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  registration text not null, vin_encrypted text, make text not null, model text not null, year integer not null,
  color text, mileage_km integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, registration)
);

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(), franchise_id uuid not null references public.franchises(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade, name text not null, description text not null,
  base_price numeric(12,2) not null, estimated_minutes integer not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(), reference text not null unique,
  franchise_id uuid not null references public.franchises(id), shop_id uuid not null references public.shops(id),
  customer_id uuid not null references public.profiles(id), vehicle_id uuid not null references public.vehicles(id),
  service_id uuid references public.service_catalog(id),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','CONFIRMED','CHECKED_IN','IN_PROGRESS','AWAITING_APPROVAL','READY_FOR_COLLECTION','COMPLETED','CANCELLED')),
  scheduled_at timestamptz not null, customer_notes text, internal_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(), reference text not null unique,
  franchise_id uuid not null references public.franchises(id), shop_id uuid not null references public.shops(id),
  booking_id uuid unique references public.bookings(id), customer_id uuid not null references public.profiles(id),
  vehicle_id uuid not null references public.vehicles(id), assigned_mechanic_id uuid references public.memberships(id),
  status text not null default 'OPEN' check (status in ('OPEN','DIAGNOSING','AWAITING_APPROVAL','APPROVED','IN_PROGRESS','QUALITY_CHECK','READY','COMPLETED','CANCELLED')),
  odometer_in_km integer, promised_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.job_stages (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null, note text, created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), franchise_id uuid not null references public.franchises(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade, sku text not null, name text not null,
  quantity_on_hand numeric(12,3) not null default 0, reorder_level numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null, selling_price numeric(12,2) not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(shop_id, sku)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(), number text not null unique,
  franchise_id uuid not null references public.franchises(id), shop_id uuid not null references public.shops(id),
  customer_id uuid not null references public.profiles(id), job_id uuid unique references public.jobs(id),
  status text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID','OVERDUE')),
  subtotal numeric(12,2) not null, tax_amount numeric(12,2) not null, total_amount numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0, currency text not null default 'KES', issued_at timestamptz, due_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null, quantity numeric(12,3) not null, unit_price numeric(12,2) not null, line_total numeric(12,2) not null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(), reference text not null unique,
  franchise_id uuid not null references public.franchises(id), shop_id uuid not null references public.shops(id),
  customer_id uuid not null references public.profiles(id), invoice_id uuid not null references public.invoices(id),
  provider text not null check (provider in ('MPESA','CASH','CARD','BANK_TRANSFER')), provider_reference text unique,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED','REFUNDED')),
  amount numeric(12,2) not null, currency text not null default 'KES', failure_reason text, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(), name text not null, code text not null unique, monthly_price numeric(12,2) not null,
  max_shops integer not null, max_staff integer not null, features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true, created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), franchise_id uuid not null unique references public.franchises(id) on delete cascade,
  plan_id uuid not null references public.plans(id), trial_ends_at timestamptz, current_period_starts_at timestamptz not null,
  current_period_ends_at timestamptz not null, cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, body text not null, type text not null, data jsonb, read_at timestamptz, created_at timestamptz not null default now()
);

create table public.push_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique, platform text not null check (platform in ('web','android','ios')),
  last_seen_at timestamptz not null default now(), created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), franchise_id uuid references public.franchises(id),
  action text not null, entity_type text not null, entity_id uuid, metadata jsonb, created_at timestamptz not null default now()
);

create index bookings_customer_scheduled on public.bookings(customer_id, scheduled_at desc);
create index bookings_shop_scheduled on public.bookings(shop_id, scheduled_at);
create index jobs_tenant_status on public.jobs(franchise_id, shop_id, status);
create index invoices_customer_created on public.invoices(customer_id, created_at desc);
create index payments_invoice_status on public.payments(invoice_id, status);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare table_name text; begin
  foreach table_name in array array['profiles','franchises','shops','memberships','vehicles','service_catalog','bookings','jobs','inventory_items','invoices','payments','subscriptions']
  loop execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name); end loop;
end $$;

create or replace function public.provision_new_user(
  p_user_id uuid, p_email text, p_first_name text, p_last_name text, p_phone_encrypted text, p_phone_search_hash text,
  p_account_type text, p_business_name text default null, p_shop_name text default null, p_county text default null, p_address text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_franchise_id uuid; v_shop_id uuid; v_plan_id uuid; v_slug text; v_now timestamptz := now();
begin
  insert into profiles(id,email,first_name,last_name,phone_encrypted,phone_search_hash)
  values(p_user_id,lower(p_email),p_first_name,p_last_name,p_phone_encrypted,p_phone_search_hash);
  if p_account_type = 'garage' then
    if p_business_name is null or p_shop_name is null or p_county is null or p_address is null then raise exception 'Garage details are required'; end if;
    v_slug := trim(both '-' from regexp_replace(lower(p_business_name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(p_user_id::text,'-',''),1,6);
    insert into franchises(name,slug,email,phone_encrypted,owner_id) values(p_business_name,v_slug,lower(p_email),p_phone_encrypted,p_user_id) returning id into v_franchise_id;
    insert into shops(franchise_id,name,slug,email,phone_encrypted,address,county)
    values(v_franchise_id,p_shop_name,trim(both '-' from regexp_replace(lower(p_shop_name),'[^a-z0-9]+','-','g')),lower(p_email),p_phone_encrypted,p_address,p_county) returning id into v_shop_id;
    insert into memberships(user_id,franchise_id,role) values(p_user_id,v_franchise_id,'FRANCHISE_OWNER');
    insert into plans(name,code,monthly_price,max_shops,max_staff,features) values('Starter','STARTER',3500,1,8,'["bookings","jobs","inventory","invoices"]'::jsonb)
      on conflict(code) do update set code=excluded.code returning id into v_plan_id;
    insert into subscriptions(franchise_id,plan_id,trial_ends_at,current_period_starts_at,current_period_ends_at)
    values(v_franchise_id,v_plan_id,v_now + interval '14 days',v_now,v_now + interval '14 days');
    insert into service_catalog(franchise_id,shop_id,name,description,base_price,estimated_minutes) values
      (v_franchise_id,v_shop_id,'Full service','Oil, filters and a comprehensive inspection',8500,120),
      (v_franchise_id,v_shop_id,'Computer diagnostics','Electronic fault scan and diagnostic report',3000,45);
  end if;
  return v_franchise_id;
end $$;

create or replace function public.create_booking(
  p_customer_id uuid, p_shop_id uuid, p_vehicle_id uuid, p_service_id uuid, p_scheduled_at timestamptz, p_customer_notes text, p_reference text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_shop shops%rowtype; v_booking_id uuid; v_count integer;
begin
  if p_scheduled_at < now() + interval '1 hour' then raise exception 'INVALID_SCHEDULE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || p_scheduled_at::date::text, 0));
  select s.* into v_shop from shops s join franchises f on f.id=s.franchise_id where s.id=p_shop_id and s.is_active and f.status in ('TRIAL','ACTIVE');
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;
  if not exists(select 1 from vehicles where id=p_vehicle_id and owner_id=p_customer_id) then raise exception 'VEHICLE_NOT_FOUND'; end if;
  if p_service_id is not null and not exists(select 1 from service_catalog where id=p_service_id and franchise_id=v_shop.franchise_id and is_active and (shop_id=p_shop_id or shop_id is null)) then raise exception 'INVALID_SERVICE'; end if;
  select count(*) into v_count from bookings where shop_id=p_shop_id and scheduled_at::date=p_scheduled_at::date and status <> 'CANCELLED';
  if v_count >= v_shop.booking_capacity then raise exception 'CAPACITY_REACHED'; end if;
  insert into bookings(reference,franchise_id,shop_id,customer_id,vehicle_id,service_id,scheduled_at,customer_notes)
  values(p_reference,v_shop.franchise_id,p_shop_id,p_customer_id,p_vehicle_id,p_service_id,p_scheduled_at,p_customer_notes) returning id into v_booking_id;
  insert into notifications(user_id,title,body,type,data) values(p_customer_id,'Booking received',v_shop.name || ' has received booking ' || p_reference || '.','BOOKING_CREATED',jsonb_build_object('bookingId',v_booking_id));
  return v_booking_id;
end $$;

create or replace function public.create_job_from_booking(p_booking_id uuid, p_actor_id uuid, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_booking bookings%rowtype; v_job_id uuid;
begin
  select * into v_booking from bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if exists(select 1 from jobs where booking_id=p_booking_id) then raise exception 'JOB_EXISTS'; end if;
  if v_booking.status not in ('CONFIRMED','CHECKED_IN') then raise exception 'INVALID_BOOKING_STATUS'; end if;
  insert into jobs(reference,franchise_id,shop_id,booking_id,customer_id,vehicle_id) values(p_reference,v_booking.franchise_id,v_booking.shop_id,v_booking.id,v_booking.customer_id,v_booking.vehicle_id) returning id into v_job_id;
  insert into job_stages(job_id,status,note) values(v_job_id,'OPEN','Job created from booking');
  update bookings set status='IN_PROGRESS' where id=p_booking_id;
  insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id,metadata) values(p_actor_id,v_booking.franchise_id,'JOB_CREATED','Job',v_job_id,jsonb_build_object('bookingId',p_booking_id));
  return v_job_id;
end $$;

revoke all on function public.provision_new_user(uuid,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.create_job_from_booking(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.provision_new_user(uuid,text,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.create_booking(uuid,uuid,uuid,uuid,timestamptz,text,text) to service_role;
grant execute on function public.create_job_from_booking(uuid,uuid,text) to service_role;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','franchises','shops','memberships','vehicles','service_catalog','bookings','jobs','job_stages','inventory_items','invoices','invoice_lines','payments','plans','subscriptions','notifications','push_devices','audit_logs']
  loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

-- Automatic Data API grants are disabled. Grant only the CRUD operations used
-- by the trusted server client; browser roles remain denied by default.
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.profiles, public.franchises, public.shops, public.memberships,
  public.vehicles, public.service_catalog, public.bookings, public.jobs,
  public.job_stages, public.inventory_items, public.invoices,
  public.invoice_lines, public.payments, public.plans, public.subscriptions,
  public.notifications, public.push_devices, public.audit_logs
to service_role;

-- Supabase's automatic-RLS event trigger does not need Data API callers to
-- execute its helper function directly.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
