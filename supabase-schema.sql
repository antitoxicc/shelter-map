create extension if not exists pgcrypto;

create table if not exists public.shelters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  address text,
  source text not null default 'Источник не указан',
  shelter_type text,
  location_verification_status text not null default 'needs_review' check (location_verification_status in ('verified', 'approximate', 'needs_review')),
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  submitter_name text,
  submitter_contact text,
  media_url text,
  media_type text,
  media_name text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.shelters
  add column if not exists address text,
  add column if not exists source text not null default 'Источник не указан',
  add column if not exists shelter_type text,
  add column if not exists location_verification_status text not null default 'needs_review',
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_name text;

update public.shelters
set source = 'Источник не указан'
where source is null or btrim(source) = '';

update public.shelters
set location_verification_status = 'needs_review'
where location_verification_status is null or btrim(location_verification_status) = '';

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.shelters enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

drop policy if exists "approved shelters are visible to everyone" on public.shelters;
create policy "approved shelters are visible to everyone"
on public.shelters
for select
using (status = 'approved' or public.is_admin());

drop policy if exists "anyone can submit pending shelters" on public.shelters;
create policy "anyone can submit pending shelters"
on public.shelters
for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "admins can update shelters" on public.shelters;
create policy "admins can update shelters"
on public.shelters
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete shelters" on public.shelters;
create policy "admins can delete shelters"
on public.shelters
for delete
to authenticated
using (public.is_admin());

drop policy if exists "admins can see admin list" on public.admin_users;
create policy "admins can see admin list"
on public.admin_users
for select
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('shelter-media', 'shelter-media', true)
on conflict (id) do nothing;

drop policy if exists "public can read shelter media" on storage.objects;
create policy "public can read shelter media"
on storage.objects
for select
to public
using (bucket_id = 'shelter-media');

drop policy if exists "anyone can upload shelter media" on storage.objects;
create policy "anyone can upload shelter media"
on storage.objects
for insert
to public
with check (bucket_id = 'shelter-media');

drop policy if exists "admins can manage shelter media" on storage.objects;
create policy "admins can manage shelter media"
on storage.objects
for all
to authenticated
using (bucket_id = 'shelter-media' and public.is_admin())
with check (bucket_id = 'shelter-media' and public.is_admin());

insert into public.shelters (id, title, description, address, shelter_type, latitude, longitude, status)
values
  ('11111111-1111-1111-1111-111111111111', '??????? ?? Dizengoff', '???? ?? ?????, ???????? ?????????.', 'Dizengoff St 120, Tel Aviv-Yafo', 'building_shelter', 32.0853, 34.7818, 'approved'),
  ('22222222-2222-2222-2222-222222222222', '????????? ??????? ? ????????', '????? ? ??????? ?? ????????? ????????.', 'HaYarkon St 18, Tel Aviv-Yafo', 'parking', 32.0900, 34.7900, 'approved'),
  ('33333333-3333-3333-3333-333333333333', '??????? ??? ???????', '????? ?? ???????? ?? ??????? ??????.', 'Allenby St 52, Tel Aviv-Yafo', 'building_shelter', 32.0800, 34.7700, 'approved')
on conflict (id) do nothing;

-- После создания первого пользователя в Supabase Auth:
-- insert into public.admin_users (user_id) values ('UUID_ПОЛЬЗОВАТЕЛЯ');
