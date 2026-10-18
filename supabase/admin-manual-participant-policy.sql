-- Run this once in Supabase SQL Editor for the EXISTING TEST project only.
-- It permits authenticated users listed in public.admin_users to add participants manually.
grant insert on public.participants to authenticated;
drop policy if exists "admins insert participants" on public.participants;
create policy "admins insert participants"
on public.participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  )
);
