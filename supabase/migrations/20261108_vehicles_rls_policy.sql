-- Self-scoped vehicles: owners get CRUD on their own registered vehicles.
grant select, insert, update, delete on public.vehicles to authenticated;
create policy "vehicles_owner_isolation" on public.vehicles
for all to authenticated
using      ( owner_id = auth.uid() )
with check ( owner_id = auth.uid() );
