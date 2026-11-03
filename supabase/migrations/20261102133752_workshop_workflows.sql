-- Applied after the existing AutoCare migrations. All mutations use server-only RPCs.
create table public.repair_quotes (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
 version integer not null, status text not null default 'PENDING' check(status in ('PENDING','APPROVED','DECLINED','SUPERSEDED')),
 total numeric(12,2) not null check(total>0), note text, created_by uuid not null references public.profiles(id),
 decided_by uuid references public.profiles(id), decided_at timestamptz, created_at timestamptz not null default now(), unique(job_id,version)
);
create table public.repair_quote_lines (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.repair_quotes(id),
 description text not null, quantity numeric(12,3) not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0),
 inventory_item_id uuid references public.inventory_items(id), position integer not null
);
alter table public.jobs add column current_quote_id uuid references public.repair_quotes(id);
create table public.job_part_movements (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique, job_id uuid not null references public.jobs(id),
 item_id uuid not null references public.inventory_items(id), quantity numeric(12,3) not null check(quantity<>0),
 actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index job_parts_job on public.job_part_movements(job_id,item_id);
create table public.workshop_bays (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), name text not null, unique(shop_id,name)
);
create table public.workshop_slots (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null unique references public.bookings(id),
 shop_id uuid not null references public.shops(id), mechanic_id uuid not null references public.memberships(id),
 bay_id uuid not null references public.workshop_bays(id), starts_at timestamptz not null, ends_at timestamptz not null,
 created_by uuid not null references public.profiles(id), check(ends_at>starts_at)
);
create index workshop_slots_time on public.workshop_slots(shop_id,starts_at,ends_at);
create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), franchise_id uuid not null references public.franchises(id), shop_id uuid references public.shops(id),
 email text not null, role text not null check(role in ('FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','MECHANIC','INVENTORY_CLERK','ACCOUNTANT')),
 invited_by uuid not null references public.profiles(id), expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.vehicle_history_shares (
 vehicle_id uuid not null references public.vehicles(id), franchise_id uuid not null references public.franchises(id),
 owner_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), primary key(vehicle_id,franchise_id)
);
create table public.maintenance_reminders (
 id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id), owner_id uuid not null references public.profiles(id),
 title text not null, due_date date, due_mileage integer check(due_mileage>=0), completed_at timestamptz,
 created_at timestamptz not null default now(), check(due_date is not null or due_mileage is not null)
);
create index quote_lines_quote on public.repair_quote_lines(quote_id);
create index quotes_creator on public.repair_quotes(created_by);
create index reminders_owner_vehicle on public.maintenance_reminders(owner_id,vehicle_id);
create index history_shares_garage on public.vehicle_history_shares(franchise_id,vehicle_id);
create index invitations_email on public.staff_invitations(email);
create index invitations_franchise on public.staff_invitations(franchise_id);
create index slots_mechanic_time on public.workshop_slots(mechanic_id,starts_at,ends_at);
do $$ declare t text; begin
 foreach t in array array['repair_quotes','repair_quote_lines','job_part_movements','workshop_bays','workshop_slots','staff_invitations','vehicle_history_shares','maintenance_reminders'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.workshop_member(p_actor_id uuid,p_franchise_id uuid,p_shop_id uuid,p_roles text[]) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.memberships m join public.franchises f on f.id=m.franchise_id join public.profiles p on p.id=m.user_id
 where m.user_id=p_actor_id and m.franchise_id=p_franchise_id and (m.shop_id is null or m.shop_id=p_shop_id) and m.is_active and p.is_active
 and m.role=any(p_roles) and f.status not in ('SUSPENDED','CANCELLED'));
$$;

create function public.send_repair_quote(p_actor_id uuid,p_job_id uuid,p_lines jsonb,p_note text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare j jobs%rowtype; qid uuid; total numeric; item jsonb; pos integer:=0; version_no integer;
begin
 select * into j from jobs where id=p_job_id for update;
 if not found or not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR']) then raise exception 'FORBIDDEN'; end if;
 if j.status in ('COMPLETED','CANCELLED') or exists(select 1 from invoices where job_id=j.id) then raise exception 'JOB_CLOSED'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'INVALID_LINES'; end if;
 total:=0;
 for item in select * from jsonb_array_elements(p_lines) loop
  if length(trim(item->>'description')) not between 2 and 200 or (item->>'quantity')::numeric<=0 or (item->>'unitPrice')::numeric<0 then raise exception 'INVALID_LINES'; end if;
  if item->>'inventoryItemId' is not null and not exists(select 1 from inventory_items where id=(item->>'inventoryItemId')::uuid and shop_id=j.shop_id and is_active) then raise exception 'INVALID_LINES'; end if;
  total:=total+round((item->>'quantity')::numeric*(item->>'unitPrice')::numeric,2);
 end loop;
 if total is null or total<=0 or total>100000000 then raise exception 'INVALID_LINES'; end if;
 -- A revised quote cannot silently remove parts already fitted.
 if exists(select 1 from job_part_movements m where m.job_id=j.id group by m.item_id having sum(m.quantity) > coalesce((select sum((x->>'quantity')::numeric) from jsonb_array_elements(p_lines) x where (x->>'inventoryItemId')::uuid=m.item_id),0)) then raise exception 'INVALID_LINES'; end if;
 select coalesce(max(version),0)+1 into version_no from repair_quotes where job_id=j.id;
 update repair_quotes set status='SUPERSEDED' where id=j.current_quote_id and status='PENDING';
 insert into repair_quotes(job_id,version,total,note,created_by) values(j.id,version_no,total,p_note,p_actor_id) returning id into qid;
 for item in select * from jsonb_array_elements(p_lines) loop
  insert into repair_quote_lines(quote_id,description,quantity,unit_price,inventory_item_id,position) values(qid,item->>'description',(item->>'quantity')::numeric,(item->>'unitPrice')::numeric,(item->>'inventoryItemId')::uuid,pos); pos:=pos+1;
 end loop;
 update jobs set current_quote_id=qid,estimate_amount=total,estimate_note=p_note,status='AWAITING_APPROVAL' where id=j.id;
 insert into notifications(user_id,title,body,type,data) values(j.customer_id,'Repair quote needs approval','Review the itemized quote before repair work continues.','QUOTE',jsonb_build_object('jobId',j.id));
 return qid;
end $$;

create function public.decide_repair_quote(p_actor_id uuid,p_quote_id uuid,p_decision text) returns void
language plpgsql security invoker set search_path=public as $$
declare q repair_quotes%rowtype; j jobs%rowtype; jid uuid;
begin
 select job_id into jid from repair_quotes where id=p_quote_id;
 select * into j from jobs where id=jid for update;
 if not found or j.customer_id<>p_actor_id then raise exception 'FORBIDDEN'; end if;
 select * into q from repair_quotes where id=p_quote_id for update;
 if j.current_quote_id<>q.id or q.status<>'PENDING' or p_decision not in ('APPROVED','DECLINED') then raise exception 'QUOTE_CHANGED'; end if;
 update repair_quotes set status=p_decision,decided_by=p_actor_id,decided_at=now() where id=q.id;
 update jobs set status=case when p_decision='APPROVED' then 'APPROVED' else 'AWAITING_APPROVAL' end where id=j.id;
 insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id,metadata) values(p_actor_id,j.franchise_id,'QUOTE_'||p_decision,'Quote',q.id,jsonb_build_object('amount',q.total,'version',q.version));
end $$;

create function public.record_job_parts(p_actor_id uuid,p_job_id uuid,p_item_id uuid,p_quantity numeric,p_direction text,p_request_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare j jobs%rowtype; stock inventory_items%rowtype; used numeric; approved numeric; delta numeric;
begin
 select * into j from jobs where id=p_job_id for update;
 if not found or not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','MECHANIC']) then raise exception 'FORBIDDEN'; end if;
 if not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR']) and not exists(select 1 from memberships where id=j.assigned_mechanic_id and user_id=p_actor_id and is_active) then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from job_part_movements where request_id=p_request_id and job_id=j.id and actor_id=p_actor_id and item_id=p_item_id and quantity=case when p_direction='USE' then p_quantity else -p_quantity end) then return; end if;
 if j.status in ('COMPLETED','CANCELLED') or exists(select 1 from invoices where job_id=j.id) then raise exception 'JOB_CLOSED'; end if;
 if p_quantity<=0 or p_direction not in ('USE','RETURN') then raise exception 'INVALID_LINES'; end if;
 select * into stock from inventory_items where id=p_item_id and shop_id=j.shop_id and is_active for update;
 if not found then raise exception 'INVALID_LINES'; end if;
 select coalesce(sum(quantity),0) into used from job_part_movements where job_id=j.id and item_id=p_item_id;
 if p_direction='USE' then
  if not exists(select 1 from repair_quotes where id=j.current_quote_id and status='APPROVED') then raise exception 'APPROVAL_REQUIRED'; end if;
  select coalesce(sum(quantity),0) into approved from repair_quote_lines where quote_id=j.current_quote_id and inventory_item_id=p_item_id;
  if used+p_quantity>approved then raise exception 'EXCEEDS_APPROVED'; end if;
  if stock.quantity_on_hand<p_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
  delta:=p_quantity;
 else
  if p_quantity>used then raise exception 'INVALID_RETURN'; end if; delta:=-p_quantity;
 end if;
 update inventory_items set quantity_on_hand=quantity_on_hand-delta where id=p_item_id;
 insert into job_part_movements(request_id,job_id,item_id,quantity,actor_id) values(p_request_id,j.id,p_item_id,delta,p_actor_id);
end $$;

create or replace function public.issue_repair_invoice(p_job_id uuid,p_actor_id uuid,p_number text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare j jobs%rowtype; q repair_quotes%rowtype; iid uuid;
begin
 select * into j from jobs where id=p_job_id for update;
 if not found or not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','ACCOUNTANT']) then raise exception 'FORBIDDEN'; end if;
 select id into iid from invoices where job_id=j.id; if found then return iid; end if;
 select * into q from repair_quotes where id=j.current_quote_id and status='APPROVED';
 if not found then raise exception 'APPROVAL_REQUIRED'; end if;
 if exists(select 1 from repair_quote_lines l where l.quote_id=q.id and l.inventory_item_id is not null group by l.inventory_item_id having sum(l.quantity)<>coalesce((select sum(m.quantity) from job_part_movements m where m.job_id=j.id and m.item_id=l.inventory_item_id),0)) then raise exception 'PARTS_MISMATCH'; end if;
 insert into invoices(number,franchise_id,shop_id,customer_id,job_id,status,subtotal,tax_amount,total_amount,currency,issued_at,due_at) values(p_number,j.franchise_id,j.shop_id,j.customer_id,j.id,'ISSUED',q.total,0,q.total,'KES',now(),now()+interval '7 days') returning id into iid;
 insert into invoice_lines(invoice_id,description,quantity,unit_price,line_total) select iid,description,quantity,unit_price,round(quantity*unit_price,2) from repair_quote_lines where quote_id=q.id order by position;
 insert into notifications(user_id,title,body,type,data) values(j.customer_id,'Repair invoice ready','Your approved repair invoice is ready for payment.','INVOICE_ISSUED',jsonb_build_object('invoiceId',iid,'jobId',j.id));
 insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id,metadata) values(p_actor_id,j.franchise_id,'INVOICE_ISSUED','Invoice',iid,jsonb_build_object('quoteId',q.id));
 return iid;
end $$;

create function public.save_workshop_slot(p_actor_id uuid,p_booking_id uuid,p_mechanic_id uuid,p_bay_id uuid,p_starts_at timestamptz,p_ends_at timestamptz) returns void
language plpgsql security invoker set search_path=public as $$
declare b bookings%rowtype; s shops%rowtype; local_start timestamp; local_end timestamp; hours jsonb;
begin
 select * into b from bookings where id=p_booking_id for update;
 if not found or not workshop_member(p_actor_id,b.franchise_id,b.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR']) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.shop_id::text,42));
 perform pg_advisory_xact_lock(hashtextextended(p_mechanic_id::text,43));
 select * into s from shops where id=b.shop_id;
 local_start:=p_starts_at at time zone s.timezone; local_end:=p_ends_at at time zone s.timezone;
 hours:=s.opening_hours->(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from local_start)::integer+1];
 if b.status not in ('CONFIRMED','CHECKED_IN','IN_PROGRESS','AWAITING_APPROVAL') or p_starts_at<now() or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '12 hours' or local_start::date<>local_end::date or hours is null or hours='null'::jsonb or local_start::time<(hours->>'open')::time or local_end::time>(hours->>'close')::time then raise exception 'INVALID_SCHEDULE'; end if;
 if not exists(select 1 from memberships where id=p_mechanic_id and franchise_id=b.franchise_id and (shop_id is null or shop_id=b.shop_id) and role='MECHANIC' and is_active) or not exists(select 1 from workshop_bays where id=p_bay_id and shop_id=b.shop_id) then raise exception 'INVALID_SCHEDULE'; end if;
 if exists(select 1 from workshop_slots ws join bookings bk on bk.id=ws.booking_id where ws.booking_id<>b.id and bk.status not in ('CANCELLED','DECLINED','COMPLETED') and (ws.mechanic_id=p_mechanic_id or ws.bay_id=p_bay_id) and ws.starts_at<p_ends_at and ws.ends_at>p_starts_at) then raise exception 'SLOT_CONFLICT'; end if;
 insert into workshop_slots(booking_id,shop_id,mechanic_id,bay_id,starts_at,ends_at,created_by) values(b.id,b.shop_id,p_mechanic_id,p_bay_id,p_starts_at,p_ends_at,p_actor_id) on conflict(booking_id) do update set mechanic_id=excluded.mechanic_id,bay_id=excluded.bay_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,created_by=excluded.created_by;
 update bookings set scheduled_at=p_starts_at where id=b.id;
 update jobs set assigned_mechanic_id=p_mechanic_id where booking_id=b.id;
 insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id,metadata) values(p_actor_id,b.franchise_id,'VISIT_SCHEDULED','Booking',b.id,jsonb_build_object('mechanicId',p_mechanic_id,'bayId',p_bay_id,'startsAt',p_starts_at,'endsAt',p_ends_at));
end $$;

create function public.accept_staff_invitation(p_actor_id uuid,p_invitation_id uuid,p_verified_email text) returns void
language plpgsql security invoker set search_path=public as $$
declare i staff_invitations%rowtype;
begin
 perform 1 from profiles where id=p_actor_id for update;
 select * into i from staff_invitations where id=p_invitation_id for update;
 if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() or lower(i.email) is distinct from lower(p_verified_email) or not exists(select 1 from profiles where id=p_actor_id and is_active and lower(email)=lower(p_verified_email)) then raise exception 'INVITATION_INVALID'; end if;
 if not workshop_member(i.invited_by,i.franchise_id,i.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN']) then raise exception 'INVITATION_INVALID'; end if;
 if exists(select 1 from memberships where user_id=p_actor_id and is_active) then raise exception 'MEMBERSHIP_EXISTS'; end if;
 insert into memberships(user_id,franchise_id,shop_id,role) values(p_actor_id,i.franchise_id,i.shop_id,i.role);
 update staff_invitations set accepted_at=now() where id=i.id;
 insert into audit_logs(actor_id,franchise_id,action,entity_type,entity_id) values(p_actor_id,i.franchise_id,'STAFF_INVITATION_ACCEPTED','StaffInvitation',i.id);
end $$;

-- Restrict every new RPC to the server's service role, including the membership helper.
create function public.guard_approved_repair() returns trigger language plpgsql security invoker set search_path=public as $$
declare jid uuid; qid uuid;
begin
 if tg_table_name='repair_tasks' then
  jid:=new.job_id;
  select current_quote_id into qid from jobs where id=jid for update;
  if exists(select 1 from jobs where id=jid and status in ('COMPLETED','CANCELLED')) then raise exception 'JOB_CLOSED'; end if;
  if new.status='PENDING' then return new; end if;
 else
  if new.status not in ('IN_PROGRESS','QUALITY_CHECK','READY','COMPLETED') or new.status is not distinct from old.status then return new; end if;
  qid:=new.current_quote_id;
 end if;
 -- Existing invoiced repairs predate quote approvals. Preserve their handover workflow.
 if qid is null and exists(select 1 from invoices where job_id=case when tg_table_name='repair_tasks' then jid else new.id end) then return new; end if;
 if not exists(select 1 from repair_quotes where id=qid and status='APPROVED') then raise exception 'APPROVAL_REQUIRED'; end if;
 return new;
end $$;
create trigger repair_task_approval before insert or update on public.repair_tasks for each row execute function public.guard_approved_repair();
create trigger repair_job_approval before update on public.jobs for each row execute function public.guard_approved_repair();

create function public.assign_scheduled_mechanic() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 select mechanic_id into new.assigned_mechanic_id from workshop_slots where booking_id=new.booking_id;
 return new;
end $$;
create trigger assign_scheduled_mechanic before insert on public.jobs for each row execute function public.assign_scheduled_mechanic();

create function public.guard_vehicle_mileage() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.mileage_km<coalesce(old.mileage_km,0) then raise exception 'INVALID_MILEAGE'; end if;
 return new;
end $$;
create trigger vehicle_mileage_monotonic before update of mileage_km on public.vehicles for each row execute function public.guard_vehicle_mileage();

create function public.record_service_mileage(p_actor_id uuid,p_job_id uuid,p_mileage integer) returns void language plpgsql security invoker set search_path=public as $$
declare j jobs%rowtype; current_mileage integer;
begin
 select * into j from jobs where id=p_job_id for update;
 if not found or not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR','MECHANIC']) then raise exception 'FORBIDDEN'; end if;
 if not workshop_member(p_actor_id,j.franchise_id,j.shop_id,array['FRANCHISE_OWNER','FRANCHISE_ADMIN','SHOP_MANAGER','SERVICE_ADVISOR']) and not exists(select 1 from memberships where id=j.assigned_mechanic_id and user_id=p_actor_id and is_active) then raise exception 'FORBIDDEN'; end if;
 select mileage_km into current_mileage from vehicles where id=j.vehicle_id for update;
 if p_mileage<coalesce(current_mileage,0) or p_mileage>2000000 then raise exception 'INVALID_MILEAGE'; end if;
 if j.status in ('COMPLETED','CANCELLED') then raise exception 'JOB_CLOSED'; end if;
 update jobs set odometer_in_km=p_mileage where id=j.id;
 update vehicles set mileage_km=p_mileage where id=j.vehicle_id;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('workshop_member','send_repair_quote','decide_repair_quote','record_job_parts','issue_repair_invoice','save_workshop_slot','accept_staff_invitation','guard_approved_repair','assign_scheduled_mechanic','guard_vehicle_mileage','record_service_mileage') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
