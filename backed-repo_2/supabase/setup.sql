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
-- Backed migration 008
-- Run ONCE in the Supabase SQL Editor, after 002 to 007 (007 is the admin one).
-- Adds the records the email system needs: whether a receipt was sent, and a log of every email attempt.

alter table public.orders add column if not exists receipt_sent_at timestamptz;
-- (Migration 006 limits which order columns signed-in users can read. This new column is not on that list, so it stays hidden from them.)

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  template text not null,
  ref text,                                   -- the order or report this email was about
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_recent_idx on public.email_log (created_at desc);
alter table public.email_log enable row level security;   -- no policies: server only. It holds no email addresses.
-- Backed migration 009: artist applications
-- Run ONCE in the Supabase SQL Editor, after 002 to 008 (and your artwork and profile-limit files).
-- Adds the applications table, and updates the admin overview so it can show how many are waiting.

create table if not exists public.artist_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_name text not null check (char_length(trim(stage_name)) between 2 and 60),
  craft text not null check (craft in ('artist', 'producer', 'dj', 'other')),
  links text not null check (char_length(links) between 8 and 1500),     -- up to 5 links to existing music, one per line
  bio text check (bio is null or char_length(bio) <= 500),
  rights_confirmed boolean not null check (rights_confirmed),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),   -- shown to the applicant
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open application per person at a time. Someone who was turned down can apply again.
create unique index if not exists artist_applications_one_pending on public.artist_applications (user_id) where status = 'pending';
create index if not exists artist_applications_queue_idx on public.artist_applications (status, created_at desc);

alter table public.artist_applications enable row level security;
drop policy if exists "applicants see their own applications" on public.artist_applications;
create policy "applicants see their own applications" on public.artist_applications for select to authenticated using (user_id = auth.uid());
-- No insert, update or delete policies: applications are created and decided only by the server.
-- Applicants may read their own application, but not which administrator decided it.
revoke select on public.artist_applications from anon, authenticated;
grant select (id, user_id, stage_name, craft, links, bio, status, decision_note, created_at, decided_at) on public.artist_applications to authenticated;

create or replace function public.admin_list_applications(p_status text, p_limit integer, p_offset integer)
returns table (id uuid, created_at timestamptz, status text, user_id uuid, email text, display_name text, account_role text,
               stage_name text, craft text, links text, bio text, decision_note text, decided_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select a.id, a.created_at, a.status, a.user_id, u.email::text, p.display_name, p.role, a.stage_name, a.craft, a.links, a.bio, a.decision_note, a.decided_at
  from public.artist_applications a
  join public.profiles p on p.id = a.user_id
  join auth.users u on u.id = a.user_id
  where nullif(p_status, '') is null or a.status = p_status
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.admin_list_applications(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_applications(text, integer, integer) to service_role;

-- Same overview as before, with one more number.
create or replace function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'artists', (select count(*) from public.profiles where role = 'artist'),
    'unverifiedArtists', (select count(*) from public.profiles where role = 'artist' and not verified_artist),
    'pendingApplications', (select count(*) from public.artist_applications where status = 'pending'),
    'releasesPublished', (select count(*) from public.products where status = 'published'),
    'releasesRemoved', (select count(*) from public.products where status = 'removed'),
    'openReports', (select count(*) from public.takedown_reports where status = 'open'),
    'paidOrders', (select count(*) from public.orders where status = 'paid'),
    'unitsSold', (select coalesce(sum(quantity), 0) from public.orders where status = 'paid'),
    'grossMinor', (select coalesce(sum(amount_minor), 0) from public.orders where status = 'paid'),
    'followers', (select count(*) from public.follows),
    'activeCampaigns', (select count(*) from public.campaigns where status = 'active')
  );
$$;
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
-- Backed migration 011: guest checkout, US dollar pricing, film and art categories, any file type
-- Run ONCE in the Supabase SQL Editor, after 010. Safe to re-run.

-- Guest checkout: orders can belong to someone without an account.
alter table public.orders alter column buyer_id drop not null;
alter table public.orders add column if not exists is_guest boolean not null default false;
alter table public.orders add column if not exists guest_name text;
alter table public.orders add column if not exists guest_downloads_used integer not null default 0;

-- Prices can be in naira or US dollars. Which ones can be charged is set by ENABLED_CURRENCIES on the server.
alter table public.products drop constraint if exists products_currency_check;
alter table public.products add constraint products_currency_check check (currency in ('NGN', 'USD'));

-- Film and art. Film and video uses the existing "video" release type, art packs use "bundle".
insert into public.categories (slug, group_name, label, fulfillment, enabled, sort) values
  ('others_film', 'others', 'Film and video', 'digital', true, 10),
  ('others_digital_art', 'others', 'Digital art', 'digital', true, 11)
on conflict do nothing;

-- The private file bucket may hold video, images and PDF as well as audio.
-- The size limit stays as it is. Raise it only after your Supabase plan allows larger files (see docs/film-and-art.md).
update storage.buckets set allowed_mime_types = null where id = 'audio';
