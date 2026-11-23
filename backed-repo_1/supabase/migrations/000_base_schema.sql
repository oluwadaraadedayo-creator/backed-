-- Backed base schema (000)
-- Creates every table, security rule, function and storage bucket the site needs.
-- Run ONCE on a brand new Supabase project (or use supabase/setup.sql, which already contains this plus 008 to 011).

create extension if not exists pgcrypto;

-- ============ Profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member' check (char_length(display_name) between 1 and 80),
  role text not null default 'fan' check (role in ('fan', 'artist', 'admin')),
  verified_artist boolean not null default false,
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "people edit their own profile" on public.profiles;
create policy "people edit their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Nobody can promote themselves: only these three columns can be changed from the browser.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- Every new sign-up gets a fan profile. The role is never taken from sign-up data.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New member'), 80))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ Categories ============
create table if not exists public.categories (
  slug text primary key,
  group_name text not null check (group_name in ('music', 'fashion', 'others')),
  label text not null,
  fulfillment text not null default 'digital' check (fulfillment in ('digital', 'physical')),
  enabled boolean not null default true,
  sort integer not null default 0
);
alter table public.categories enable row level security;
drop policy if exists "categories are public" on public.categories;
create policy "categories are public" on public.categories for select to anon, authenticated using (true);
insert into public.categories (slug, group_name, label, fulfillment, enabled, sort) values
  ('music_artist', 'music', 'Artist', 'digital', true, 1),
  ('music_producer', 'music', 'Producer', 'digital', false, 2),
  ('music_dj', 'music', 'DJ', 'digital', true, 3),
  ('fashion_merch', 'fashion', 'Merch', 'physical', false, 4),
  ('fashion_streetwear', 'fashion', 'Streetwear', 'physical', false, 5),
  ('fashion_footies', 'fashion', 'Footies', 'physical', false, 6),
  ('others_crochet', 'others', 'Crochet', 'physical', false, 7),
  ('others_collectors', 'others', 'Collector items', 'physical', false, 8),
  ('others_art', 'others', 'Art', 'physical', false, 9)
on conflict (slug) do nothing;

-- ============ Creator standing (terms, suspensions) ============
create table if not exists public.creator_compliance (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  uploader_terms_accepted_at timestamptz,
  uploader_terms_version text,
  suspended_at timestamptz,
  strikes integer not null default 0
);
alter table public.creator_compliance enable row level security;
drop policy if exists "creators read their own standing" on public.creator_compliance;
create policy "creators read their own standing" on public.creator_compliance for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.creator_compliance from anon, authenticated;

create or replace function public.accept_uploader_terms(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('artist', 'admin')) then raise exception 'Only artists can accept the uploader terms'; end if;
  insert into public.creator_compliance (profile_id, uploader_terms_accepted_at, uploader_terms_version)
  values (auth.uid(), now(), left(coalesce(p_version, ''), 40))
  on conflict (profile_id) do update set uploader_terms_accepted_at = now(), uploader_terms_version = excluded.uploader_terms_version;
end $$;
revoke all on function public.accept_uploader_terms(text) from public, anon;
grant execute on function public.accept_uploader_terms(text) to authenticated;

-- ============ Payout accounts (created by the server) ============
create table if not exists public.artist_payouts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  subaccount_code text not null,
  bank_name text,
  account_name text not null,
  account_last4 text not null,
  created_at timestamptz not null default now()
);
alter table public.artist_payouts enable row level security;
drop policy if exists "artists read their own payout summary" on public.artist_payouts;
create policy "artists read their own payout summary" on public.artist_payouts for select to authenticated using (profile_id = auth.uid());
revoke all on public.artist_payouts from anon, authenticated;
grant select (profile_id, bank_name, account_name, account_last4) on public.artist_payouts to authenticated;

-- ============ Products (releases) ============
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 3000),
  product_type text not null default 'album' check (product_type in ('single', 'ep', 'album', 'live_recording', 'video', 'bundle')),
  category text not null default 'music_artist' references public.categories(slug),
  fulfillment text not null default 'digital' check (fulfillment in ('digital', 'physical')),
  artwork_path text,
  price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000000),
  currency text not null default 'NGN',
  pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed', 'pay_what_you_want')),
  min_price_minor bigint check (min_price_minor is null or min_price_minor > 0),
  tracklist text[] not null default '{}',
  benefits text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'removed')),
  rights_confirmed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint products_currency_check check (currency in ('NGN', 'USD')),
  constraint products_pwyw_check check (pricing_mode = 'fixed' or (min_price_minor is not null and price_minor >= min_price_minor))
);
create index if not exists products_creator_idx on public.products (creator_id, created_at desc);
create index if not exists products_published_idx on public.products (published_at desc) where status = 'published';

-- ============ Orders ============
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  buyer_email text not null,
  product_id uuid not null references public.products(id),
  creator_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  quantity integer not null default 1 check (quantity between 1 and 10),
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  payment_provider text not null default 'paystack',
  payment_reference text not null unique,
  provider_transaction_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'payment_initialization_failed', 'verification_failed', 'refunded', 'disputed')),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  subaccount_code text,
  paid_at timestamptz,
  refunded_at timestamptz,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists orders_creator_idx on public.orders (creator_id, status, paid_at desc);
create index if not exists orders_buyer_idx on public.orders (buyer_id, status);
create index if not exists orders_product_idx on public.orders (product_id, status);
-- A signed-in buyer can own a release only once. The server turns a second paid attempt into a refund note.
create unique index if not exists orders_one_paid_per_buyer on public.orders (buyer_id, product_id) where status = 'paid' and buyer_id is not null;

alter table public.orders enable row level security;
drop policy if exists "buyers and creators read their orders" on public.orders;
create policy "buyers and creators read their orders" on public.orders for select to authenticated using (buyer_id = auth.uid() or creator_id = auth.uid());
-- Orders are written only by the server. Browsers can read just these columns.
revoke all on public.orders from anon, authenticated;
grant select (id, buyer_id, creator_id, product_id, status, amount_minor, platform_fee_minor, quantity, currency, paid_at, created_at) on public.orders to authenticated;

-- Product visibility and safety rules (needs orders to exist first).
alter table public.products enable row level security;
drop policy if exists "published releases are public" on public.products;
create policy "published releases are public" on public.products for select to anon, authenticated using (status = 'published');
drop policy if exists "owners and buyers see their releases" on public.products;
create policy "owners and buyers see their releases" on public.products for select to authenticated using (
  creator_id = auth.uid()
  or exists (select 1 from public.orders o where o.product_id = products.id and o.buyer_id = auth.uid() and o.status = 'paid'));
drop policy if exists "artists add their own releases" on public.products;
create policy "artists add their own releases" on public.products for insert to authenticated with check (creator_id = auth.uid());
drop policy if exists "artists edit their own releases" on public.products;
create policy "artists edit their own releases" on public.products for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
revoke delete on public.products from anon, authenticated;
revoke insert, update on public.products from anon;

-- ============ Files and previews ============
create table if not exists public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null default 0 check (position between 0 and 99),
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index if not exists product_files_product_idx on public.product_files (product_id, status, position);
alter table public.product_files enable row level security;
drop policy if exists "creators see their own files" on public.product_files;
create policy "creators see their own files" on public.product_files for select to authenticated using (creator_id = auth.uid());
revoke all on public.product_files from anon, authenticated;
grant select on public.product_files to authenticated;

create table if not exists public.product_previews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null default 0 check (position between 0 and 99),
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index if not exists product_previews_product_idx on public.product_previews (product_id, status, position);
alter table public.product_previews enable row level security;
drop policy if exists "creators see their own previews" on public.product_previews;
create policy "creators see their own previews" on public.product_previews for select to authenticated using (creator_id = auth.uid());
revoke all on public.product_previews from anon, authenticated;
grant select on public.product_previews to authenticated;

-- Guards on releases: forced owner, publishing checklist, no self-removal bypass.
create or replace function public.products_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare prof record; comp record;
begin
  select fulfillment into new.fulfillment from public.categories where slug = new.category;
  if new.fulfillment is null then new.fulfillment := 'digital'; end if;
  if auth.uid() is null then return new; end if;   -- trusted server or SQL editor
  select role, verified_artist into prof from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if prof.role not in ('artist', 'admin') then raise exception 'Only artists can create releases'; end if;
    new.creator_id := auth.uid();
    if new.status <> 'draft' then raise exception 'New releases start as drafts'; end if;
    new.published_at := null;
    return new;
  end if;
  if new.creator_id <> old.creator_id then raise exception 'Cannot change the owner of a release'; end if;
  if old.status = 'removed' then raise exception 'This release was removed and cannot be changed'; end if;
  if new.status = 'removed' then raise exception 'Only the platform can remove a release'; end if;
  new.published_at := old.published_at;
  if new.status = 'published' and old.status <> 'published' then
    select uploader_terms_accepted_at, suspended_at into comp from public.creator_compliance where profile_id = auth.uid();
    if not coalesce(prof.verified_artist, false) then raise exception 'Your artist account is not verified yet'; end if;
    if comp.uploader_terms_accepted_at is null then raise exception 'Accept the uploader terms first'; end if;
    if comp.suspended_at is not null then raise exception 'Your account is suspended'; end if;
    if new.rights_confirmed_at is null then raise exception 'Confirm the rights statement first'; end if;
    if coalesce(new.artwork_path, '') = '' then raise exception 'Add artwork first'; end if;
    if not exists (select 1 from public.product_files f where f.product_id = new.id and f.status = 'active') then raise exception 'Add at least one file first'; end if;
    new.published_at := now();
  end if;
  return new;
end $$;
drop trigger if exists products_guard_trg on public.products;
create trigger products_guard_trg before insert or update on public.products for each row execute function public.products_guard();

create or replace function public.reorder_product_files(p_product uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.products where id = p_product and creator_id = auth.uid()) then raise exception 'Not allowed'; end if;
  select count(*) into n from public.product_files where product_id = p_product and status = 'active';
  if coalesce(array_length(p_ids, 1), 0) <> n or exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.product_files f where f.id = i and f.product_id = p_product and f.status = 'active')) then
    raise exception 'The list of files does not match';
  end if;
  update public.product_files f set position = least(o.ord - 1, 99) from unnest(p_ids) with ordinality as o(id, ord) where f.id = o.id;
end $$;
revoke all on function public.reorder_product_files(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_files(uuid, uuid[]) to authenticated;

-- ============ Follows ============
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);
create index if not exists follows_creator_idx on public.follows (creator_id);
alter table public.follows enable row level security;
drop policy if exists "people see who they follow" on public.follows;
create policy "people see who they follow" on public.follows for select to authenticated using (follower_id = auth.uid());
drop policy if exists "people follow as themselves" on public.follows;
create policy "people follow as themselves" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "people unfollow as themselves" on public.follows;
create policy "people unfollow as themselves" on public.follows for delete to authenticated using (follower_id = auth.uid());
revoke all on public.follows from anon, authenticated;
grant select, insert, delete on public.follows to authenticated;

create or replace function public.follower_counts(p_ids uuid[]) returns table (id uuid, followers bigint)
language sql stable security definer set search_path = public as $$
  select i, (select count(*) from public.follows f where f.creator_id = i) from unnest(coalesce(p_ids, '{}'::uuid[])) as i $$;
grant execute on function public.follower_counts(uuid[]) to anon, authenticated;

-- ============ Campaigns and plaques ============
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  goal_units integer not null check (goal_units between 1 and 100000),
  status text not null default 'active' check (status in ('active', 'ended')),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_creator_idx on public.campaigns (creator_id, created_at desc);
alter table public.campaigns enable row level security;
drop policy if exists "campaigns are public" on public.campaigns;
create policy "campaigns are public" on public.campaigns for select to anon, authenticated using (true);
drop policy if exists "artists start campaigns on their releases" on public.campaigns;
create policy "artists start campaigns on their releases" on public.campaigns for insert to authenticated
  with check (creator_id = auth.uid() and exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()));
drop policy if exists "artists end their campaigns" on public.campaigns;
create policy "artists end their campaigns" on public.campaigns for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to anon, authenticated;
grant insert (creator_id, product_id, title, goal_units) on public.campaigns to authenticated;
grant update (status) on public.campaigns to authenticated;

-- Units sold since the campaign began, and the plaques earned at 25%, 50%, 75% and 100% of the goal.
create or replace function public.campaign_progress(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; confirmed integer; pending integer; plaques jsonb := '[]'::jsonb; t record; at_ts timestamptz;
begin
  select * into c from public.campaigns where id = p_campaign;
  if not found then return null; end if;
  select coalesce(sum(o.quantity), 0) into confirmed from public.orders o
    where o.product_id = c.product_id and o.status = 'paid' and o.paid_at >= c.created_at and (c.ends_at is null or o.paid_at <= c.ends_at);
  select coalesce(sum(o.quantity), 0) into pending from public.orders o
    where o.product_id = c.product_id and o.status = 'pending' and o.created_at > now() - interval '2 hours';
  for t in select * from (values ('Bronze', 'tier', 0.25), ('Silver', 'tier', 0.5), ('Gold', 'tier', 0.75), ('Goal reached', 'goal', 1.0)) as v(name, kind, pct) loop
    if confirmed >= ceil(c.goal_units * t.pct) then
      select min(x.paid_at) into at_ts from (
        select o.paid_at, sum(o.quantity) over (order by o.paid_at, o.id) as running from public.orders o
        where o.product_id = c.product_id and o.status = 'paid' and o.paid_at >= c.created_at and (c.ends_at is null or o.paid_at <= c.ends_at)) x
        where x.running >= ceil(c.goal_units * t.pct);
      plaques := plaques || jsonb_build_array(jsonb_build_object('name', t.name, 'kind', t.kind, 'tierUnits', ceil(c.goal_units * t.pct)::int, 'awardedAt', at_ts));
    end if;
  end loop;
  return jsonb_build_object('id', c.id, 'title', c.title, 'productId', c.product_id, 'goalUnits', c.goal_units, 'status', c.status,
    'confirmedUnits', confirmed, 'pendingUnits', pending, 'plaques', plaques);
end $$;
grant execute on function public.campaign_progress(uuid) to anon, authenticated;

-- ============ Sales numbers for the signed-in artist ============
create or replace function public.artist_sales(p_status text, p_limit integer, p_offset integer)
returns table (id uuid, order_ref text, sold_at timestamptz, status text, release_id uuid, release_title text, quantity integer, amount_minor bigint, platform_fee_minor bigint, split boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.payment_reference, coalesce(o.paid_at, o.created_at), o.status, o.product_id, p.title, o.quantity, o.amount_minor, o.platform_fee_minor, o.subaccount_code is not null
  from public.orders o join public.products p on p.id = o.product_id
  where o.creator_id = auth.uid() and o.status in ('paid', 'refunded', 'disputed') and (nullif(p_status, '') is null or o.status = p_status)
  order by coalesce(o.paid_at, o.created_at) desc, o.id
  limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0)) $$;
revoke all on function public.artist_sales(text, integer, integer) from public, anon;
grant execute on function public.artist_sales(text, integer, integer) to authenticated;

create or replace function public.artist_sales_summary()
returns table (paid_orders bigint, units bigint, gross_minor bigint, fee_minor bigint, refunded_orders bigint, refunded_minor bigint, disputed_orders bigint, unsplit_orders bigint, unsplit_gross_minor bigint)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where status = 'paid'),
         coalesce(sum(quantity) filter (where status = 'paid'), 0)::bigint,
         coalesce(sum(amount_minor) filter (where status = 'paid'), 0)::bigint,
         coalesce(sum(platform_fee_minor) filter (where status = 'paid'), 0)::bigint,
         count(*) filter (where status = 'refunded'),
         coalesce(sum(amount_minor) filter (where status = 'refunded'), 0)::bigint,
         count(*) filter (where status = 'disputed'),
         count(*) filter (where status = 'paid' and subaccount_code is null),
         coalesce(sum(amount_minor) filter (where status = 'paid' and subaccount_code is null), 0)::bigint
  from public.orders where creator_id = auth.uid() $$;
revoke all on function public.artist_sales_summary() from public, anon;
grant execute on function public.artist_sales_summary() to authenticated;

-- ============ Homepage lists ============
create or replace function public.makers_list(p_limit integer)
returns table (id uuid, "displayName" text, bio text, "avatarUrl" text, "coverImage" text, categories text[], followers bigint, releases bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.bio, p.avatar_url,
    (select x.artwork_path from public.products x where x.creator_id = p.id and x.status = 'published' order by x.published_at desc limit 1),
    coalesce((select array_agg(distinct x.category) from public.products x where x.creator_id = p.id and x.status = 'published'), '{}'),
    (select count(*) from public.follows f where f.creator_id = p.id),
    (select count(*) from public.products x where x.creator_id = p.id and x.status = 'published')
  from public.profiles p
  where p.role = 'artist' and exists (select 1 from public.products x where x.creator_id = p.id and x.status = 'published')
  order by 8 desc, 7 desc, p.created_at
  limit greatest(1, least(coalesce(p_limit, 12), 50)) $$;
grant execute on function public.makers_list(integer) to anon, authenticated;

create or replace function public.trending_release_ids(p_days integer, p_limit integer) returns table (product_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id from public.products p
  left join (select o.product_id as pid, sum(o.quantity) as units from public.orders o
             where o.status = 'paid' and o.paid_at > now() - make_interval(days => greatest(1, coalesce(p_days, 14))) group by o.product_id) s on s.pid = p.id
  where p.status = 'published'
  order by coalesce(s.units, 0) desc, p.published_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 50)) $$;
grant execute on function public.trending_release_ids(integer, integer) to anon, authenticated;

-- ============ Server-only records ============
create table if not exists public.download_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists download_log_recent_idx on public.download_log (user_id, product_id, created_at desc);
alter table public.download_log enable row level security;
revoke all on public.download_log from anon, authenticated;

create table if not exists public.takedown_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reporter_name text not null,
  reporter_email text not null,
  relationship text,
  work_description text,
  good_faith boolean not null default false,
  accuracy_statement boolean not null default false,
  signature text,
  ip_hash text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists takedown_reports_ip_idx on public.takedown_reports (ip_hash, created_at desc);
alter table public.takedown_reports enable row level security;
revoke all on public.takedown_reports from anon, authenticated;

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true when the caller is still inside its allowance, false when it is over.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare h integer;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning r.hits into h;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return h <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ============ Storage buckets ============
-- audio is private (every download goes through a short-lived signed link). artwork is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('audio', 'audio', false, 52428800, null),
  ('artwork', 'artwork', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verified artists upload into their own folder" on storage.objects;
create policy "verified artists upload into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('audio', 'artwork') and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('artist', 'admin') and p.verified_artist));
