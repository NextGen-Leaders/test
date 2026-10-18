-- Run in the SQL Editor of a NEW Supabase TEST project only.
create extension if not exists pgcrypto;

create table if not exists public.conferences (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  description text,
  registration_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  email text not null check (length(trim(email)) between 3 and 254),
  phone text,
  student_code text,
  institution text,
  notes text,
  present boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add only user IDs that should have administrative access.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists participants_conference_id_idx on public.participants(conference_id);
create index if not exists participants_created_at_idx on public.participants(created_at desc);
create index if not exists participants_email_lower_idx on public.participants(lower(email));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists conferences_updated_at on public.conferences;
create trigger conferences_updated_at before update on public.conferences
for each row execute function public.set_updated_at();
drop trigger if exists participants_updated_at on public.participants;
create trigger participants_updated_at before update on public.participants
for each row execute function public.set_updated_at();

alter table public.conferences enable row level security;
alter table public.participants enable row level security;
alter table public.admin_users enable row level security;

-- Public can see only active conference options; only admins can see closed conferences.
drop policy if exists "public read open conferences" on public.conferences;
create policy "public read open conferences" on public.conferences for select to anon, authenticated
using (registration_open = true or exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "admins manage conferences" on public.conferences;
create policy "admins manage conferences" on public.conferences for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Public registration is insert-only; participant data cannot be read by the public.
drop policy if exists "public submit registration" on public.participants;
create policy "public submit registration" on public.participants for insert to anon, authenticated
with check (exists (select 1 from public.conferences c where c.id = conference_id and c.registration_open = true) and present = false);
drop policy if exists "admins insert participants" on public.participants;
create policy "admins insert participants" on public.participants for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
grant insert on public.participants to authenticated;

drop policy if exists "admins read participants" on public.participants;
create policy "admins read participants" on public.participants for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "admins update participants" on public.participants;
create policy "admins update participants" on public.participants for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "admins delete participants" on public.participants;
create policy "admins delete participants" on public.participants for delete to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Users may only read their own admin membership row; there is no client-side policy to add/edit admin_users.
drop policy if exists "admins read own membership" on public.admin_users;
create policy "admins read own membership" on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- Starter records: replace names with the four official Master's programmes.
insert into public.conferences(name, description, registration_open) values
('Master 1 — à configurer', 'Remplacez par le nom officiel du Master 1.', true),
('Master 2 — à configurer', 'Remplacez par le nom officiel du Master 2.', true),
('Master 3 — à configurer', 'Remplacez par le nom officiel du Master 3.', true),
('Master 4 — à configurer', 'Remplacez par le nom officiel du Master 4.', true)
on conflict do nothing;

-- Google Sheets automatic synchronization:
-- Recommended: configure a Supabase Database Webhook for INSERT, UPDATE, DELETE on
-- public.participants and public.conferences. Target the deployed Edge Function
-- `sheets-sync`; configure its Authorization secret and Google credentials as secrets.
-- See README.md. Do NOT place service-role or Google private keys in browser files.
