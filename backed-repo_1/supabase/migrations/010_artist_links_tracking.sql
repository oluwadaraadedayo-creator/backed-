-- Backed migration 010: short artist links and visit tracking
-- Run ONCE in the Supabase SQL Editor, after 009. Safe to re-run.
-- Adds: profiles.slug (short link name), artist_visits (one row per visitor per artist per day),
-- and RPCs the site calls. No existing policy or column grant is changed.

alter table public.profiles add column if not exists slug text;
create unique index if not exists profiles_slug_key on public.profiles (slug) where slug is not null;
alter table public.profiles drop constraint if exists profiles_slug_format;
alter table public.profiles add constraint profiles_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40);

-- Builds a free slug from a display name: "Ada Obi" -> ada-obi, then ada-obi-2 if taken.
create or replace function public.make_artist_slug(p_name text, p_self uuid)
returns text language plpgsql as $$
declare base text; cand text; n integer := 1;
begin
  base := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  if base = '' or char_length(base) < 2 then base := 'artist'; end if;
  base := left(base, 34); base := trim(both '-' from base);
  cand := base;
  while exists (select 1 from public.profiles where slug = cand and id <> p_self) loop
    n := n + 1; cand := base || '-' || n;
  end loop;
  return cand;
end $$;

create or replace function public.profiles_set_slug() returns trigger language plpgsql as $$
begin
  if new.role = 'artist' and new.slug is null then new.slug := public.make_artist_slug(new.display_name, new.id); end if;
  return new;
end $$;
drop trigger if exists profiles_set_slug_trg on public.profiles;
create trigger profiles_set_slug_trg before insert or update of role, display_name on public.profiles
  for each row execute function public.profiles_set_slug();

-- Backfill existing artists.
update public.profiles p set slug = public.make_artist_slug(p.display_name, p.id) where p.role = 'artist' and p.slug is null;

create table if not exists public.artist_visits (
  id bigint generated always as identity primary key,
  artist_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  visit_day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique (artist_id, visitor_id, visit_day)
);
create index if not exists artist_visits_artist_idx on public.artist_visits (artist_id, visit_day desc);
alter table public.artist_visits enable row level security;
revoke all on public.artist_visits from anon, authenticated;
-- No policies: rows are written and read only through the functions below.

create or replace function public.resolve_artist_slug(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where slug = lower(p_slug) and role = 'artist' limit 1 $$;

create or replace function public.artist_slug_of(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select slug from public.profiles where id = p_id and role = 'artist' limit 1 $$;

-- One row per visitor per artist per day. A repeat visit the same day is ignored.
create or replace function public.record_artist_visit(p_artist uuid, p_visitor text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 64 then return; end if;
  if not exists (select 1 from public.profiles where id = p_artist and role = 'artist') then return; end if;
  if auth.uid() is not null and auth.uid() = p_artist then return; end if;   -- the artist's own views do not count
  insert into public.artist_visits (artist_id, visitor_id) values (p_artist, p_visitor) on conflict do nothing;
end $$;

-- The signed-in artist's own numbers.
create or replace function public.artist_visit_stats()
returns table (unique_visitors bigint, visitors_7d bigint, paid_orders bigint, conversion_pct numeric)
language sql stable security definer set search_path = public as $$
  with v as (select count(distinct visitor_id) as u, count(distinct visitor_id) filter (where visit_day >= (now() at time zone 'utc')::date - 6) as u7
             from public.artist_visits where artist_id = auth.uid()),
       o as (select count(*) as n from public.orders where creator_id = auth.uid() and status = 'paid')
  select v.u, v.u7, o.n, case when v.u > 0 then round(100.0 * o.n / v.u, 2) else 0 end from v, o $$;

-- Admin only: every artist, for the validation test (visitors, buyers, share of total).
create or replace function public.admin_artist_funnel()
returns table (artist_id uuid, display_name text, slug text, unique_visitors bigint, paid_orders bigint, buyers bigint,
               conversion_pct numeric, visitor_share_pct numeric, order_share_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then raise exception 'Not allowed'; end if;
  return query
  with v as (select a.artist_id, count(distinct a.visitor_id) as u from public.artist_visits a group by a.artist_id),
       o as (select r.creator_id, count(*) as n, count(distinct lower(r.buyer_email)) as b from public.orders r where r.status = 'paid' group by r.creator_id),
       t as (select coalesce(sum(u),0) as tu from v), ot as (select coalesce(sum(n),0) as tn from o)
  select p.id, p.display_name, p.slug, coalesce(v.u,0), coalesce(o.n,0), coalesce(o.b,0),
         case when coalesce(v.u,0) > 0 then round(100.0 * coalesce(o.n,0) / v.u, 2) else 0 end,
         case when t.tu > 0 then round(100.0 * coalesce(v.u,0) / t.tu, 1) else 0 end,
         case when ot.tn > 0 then round(100.0 * coalesce(o.n,0) / ot.tn, 1) else 0 end
  from public.profiles p left join v on v.artist_id = p.id left join o on o.creator_id = p.id, t, ot
  where p.role = 'artist' order by coalesce(v.u,0) desc;
end $$;

revoke all on function public.admin_artist_funnel() from public, anon;
revoke all on function public.artist_visit_stats() from public, anon;
grant execute on function public.resolve_artist_slug(text), public.artist_slug_of(uuid), public.record_artist_visit(uuid, text) to anon, authenticated;
grant execute on function public.artist_visit_stats(), public.admin_artist_funnel() to authenticated;
