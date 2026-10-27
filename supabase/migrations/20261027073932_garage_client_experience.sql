alter table public.shops
  add column accepts_bookings boolean not null default true,
  add column opening_hours jsonb not null default '{"mon":{"open":"08:00","close":"17:00"},"tue":{"open":"08:00","close":"17:00"},"wed":{"open":"08:00","close":"17:00"},"thu":{"open":"08:00","close":"17:00"},"fri":{"open":"08:00","close":"17:00"},"sat":{"open":"08:00","close":"13:00"},"sun":null}'::jsonb;

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('REQUESTED','CONFIRMED','DECLINED','CHECKED_IN','IN_PROGRESS','AWAITING_APPROVAL','READY_FOR_COLLECTION','COMPLETED','CANCELLED'));
alter table public.bookings add column decision_note text;
alter table public.jobs add column estimate_amount numeric(12,2) check (estimate_amount >= 0), add column estimate_note text;

create table public.repair_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  note text,
  position integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index repair_tasks_job_position on public.repair_tasks(job_id,position,created_at);
create trigger repair_tasks_updated_at before update on public.repair_tasks for each row execute function public.set_updated_at();

create table public.repair_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  caption text check (char_length(caption) <= 240),
  created_at timestamptz not null default now()
);
create index repair_photos_booking_created on public.repair_photos(booking_id,created_at);
create index repair_photos_uploaded_by on public.repair_photos(uploaded_by);

alter table public.repair_tasks enable row level security;
alter table public.repair_photos enable row level security;
grant select,insert,update,delete on public.repair_tasks,public.repair_photos to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('repair-photos','repair-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('garage-logos','garage-logos',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create or replace function public.create_booking(
  p_customer_id uuid, p_shop_id uuid, p_vehicle_id uuid, p_service_id uuid, p_scheduled_at timestamptz, p_customer_notes text, p_reference text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_shop shops%rowtype; v_booking_id uuid; v_count integer; v_local timestamp; v_day text; v_hours jsonb;
begin
  if p_scheduled_at < now() + interval '1 hour' then raise exception 'INVALID_SCHEDULE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || p_scheduled_at::date::text, 0));
  select s.* into v_shop from shops s join franchises f on f.id=s.franchise_id where s.id=p_shop_id and s.is_active and s.accepts_bookings and f.status in ('TRIAL','ACTIVE');
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;
  v_local := p_scheduled_at at time zone v_shop.timezone;
  v_day := (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from v_local)::integer + 1];
  v_hours := v_shop.opening_hours -> v_day;
  if v_hours is null or v_hours = 'null'::jsonb or (v_local::time < (v_hours->>'open')::time) or (v_local::time >= (v_hours->>'close')::time) then raise exception 'OUTSIDE_OPENING_HOURS'; end if;
  if not exists(select 1 from vehicles where id=p_vehicle_id and owner_id=p_customer_id) then raise exception 'VEHICLE_NOT_FOUND'; end if;
  if p_service_id is not null and not exists(select 1 from service_catalog where id=p_service_id and franchise_id=v_shop.franchise_id and is_active and (shop_id=p_shop_id or shop_id is null)) then raise exception 'INVALID_SERVICE'; end if;
  select count(*) into v_count from bookings where shop_id=p_shop_id and (scheduled_at at time zone v_shop.timezone)::date=v_local::date and status not in ('CANCELLED','DECLINED');
  if v_count >= v_shop.booking_capacity then raise exception 'CAPACITY_REACHED'; end if;
  insert into bookings(reference,franchise_id,shop_id,customer_id,vehicle_id,service_id,scheduled_at,customer_notes)
  values(p_reference,v_shop.franchise_id,p_shop_id,p_customer_id,p_vehicle_id,p_service_id,p_scheduled_at,p_customer_notes) returning id into v_booking_id;
  insert into notifications(user_id,title,body,type,data) values(p_customer_id,'Booking request sent',v_shop.name || ' will review booking ' || p_reference || '.','BOOKING_CREATED',jsonb_build_object('bookingId',v_booking_id));
  return v_booking_id;
end $$;

create or replace function public.decide_booking(p_booking_id uuid,p_actor_id uuid,p_decision text,p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_booking bookings%rowtype;
begin
  if p_decision not in ('CONFIRMED','DECLINED') then raise exception 'INVALID_DECISION'; end if;
  select * into v_booking from bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'REQUESTED' then raise exception 'BOOKING_ALREADY_REVIEWED'; end if;
  if not exists(select 1 from memberships where user_id=p_actor_id and franchise_id=v_booking.franchise_id and is_active and (shop_id is null or shop_id=v_booking.shop_id) and role in ('FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR')) then raise exception 'FORBIDDEN'; end if;
  update bookings set status=p_decision,decision_note=p_note where id=p_booking_id;
  insert into notifications(user_id,title,body,type,data) values(v_booking.customer_id,case when p_decision='CONFIRMED' then 'Booking approved' else 'Booking declined' end,case when p_decision='CONFIRMED' then 'Your garage visit is confirmed for ' || to_char(v_booking.scheduled_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI') || '.' else 'Your booking request was declined.' end,'BOOKING_DECIDED',jsonb_build_object('bookingId',p_booking_id,'status',p_decision));
  insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id) values(p_actor_id,v_booking.franchise_id,'BOOKING_' || p_decision,'Booking',p_booking_id);
end $$;
revoke all on function public.decide_booking(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_booking(uuid,uuid,text,text) to service_role;
