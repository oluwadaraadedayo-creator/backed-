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
