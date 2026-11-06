-- Helper: the current user's active franchises.
create or replace function public.app_user_franchise_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select franchise_id
  from public.memberships
  where user_id = auth.uid()
    and is_active = true
$$;

revoke all on function public.app_user_franchise_ids() from public;
grant execute on function public.app_user_franchise_ids() to authenticated;

-- Operational tables: full read/write within the user's garage.
grant select, insert, update, delete on public.bookings to authenticated;
create policy "bookings_tenant_isolation" on public.bookings
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.jobs to authenticated;
create policy "jobs_tenant_isolation" on public.jobs
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.invoices to authenticated;
create policy "invoices_tenant_isolation" on public.invoices
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.inventory_items to authenticated;
create policy "inventory_items_tenant_isolation" on public.inventory_items
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.service_catalog to authenticated;
create policy "service_catalog_tenant_isolation" on public.service_catalog
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.shops to authenticated;
create policy "shops_tenant_isolation" on public.shops
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

grant select, insert, update, delete on public.vehicle_history_shares to authenticated;
create policy "vehicle_history_shares_tenant_isolation" on public.vehicle_history_shares
for all to authenticated
using      ( franchise_id in (select public.app_user_franchise_ids()) )
with check ( franchise_id in (select public.app_user_franchise_ids()) );

-- Sensitive tables: read-only within the garage. Writes stay server-side.
grant select on public.payments to authenticated;
create policy "payments_tenant_read" on public.payments
for select to authenticated
using ( franchise_id in (select public.app_user_franchise_ids()) );

grant select on public.subscriptions to authenticated;
create policy "subscriptions_tenant_read" on public.subscriptions
for select to authenticated
using ( franchise_id in (select public.app_user_franchise_ids()) );

grant select on public.staff_invitations to authenticated;
create policy "staff_invitations_tenant_read" on public.staff_invitations
for select to authenticated
using ( franchise_id in (select public.app_user_franchise_ids()) );

grant select on public.audit_logs to authenticated;
create policy "audit_logs_tenant_read" on public.audit_logs
for select to authenticated
using ( franchise_id in (select public.app_user_franchise_ids()) );

-- Self-scoped tables.
grant select on public.memberships to authenticated;
create policy "memberships_self_read" on public.memberships
for select to authenticated
using ( user_id = auth.uid() );

grant select, update on public.profiles to authenticated;
create policy "profiles_self_read" on public.profiles
for select to authenticated
using ( id = auth.uid() );
create policy "profiles_self_update" on public.profiles
for update to authenticated
using      ( id = auth.uid() )
with check ( id = auth.uid() );