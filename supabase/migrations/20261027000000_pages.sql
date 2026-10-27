-- uiCollection v1 : pages collectées, normalisation, réservation des captures,
-- déclenchement du robot GitHub Actions, vignettes privées.

create extension if not exists pg_net with schema extensions;

-- Normalisation ---------------------------------------------------------------

create or replace function public.normalize_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  v_path text;
  v_params text[];
begin
  m := regexp_match(trim(p_url), '^(https?)://([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#.*)?$', 'i');
  if m is null then
    raise exception 'invalid_url';
  end if;

  v_path := rtrim(m[3], '/');
  if v_path = '' then
    v_path := '/';
  end if;

  select array_agg(param order by ord) into v_params
  from unnest(string_to_array(ltrim(coalesce(m[4], ''), '?'), '&')) with ordinality as t(param, ord)
  where param <> ''
    and lower(split_part(param, '=', 1)) !~ '^utm_'
    and lower(split_part(param, '=', 1)) not in ('fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref');

  return lower(m[1]) || '://' || lower(m[2]) || v_path
    || coalesce('?' || array_to_string(v_params, '&'), '');
end;
$$;

-- Table -------------------------------------------------------------------------

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  url_normalized text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  site_name text,
  page_title text,
  final_url text,
  thumbnail_path text,
  capture_warnings jsonb not null default '[]',
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index pages_owner_url_normalized on public.pages (owner_id, url_normalized);
create index pages_status_created on public.pages (status, created_at);

create or replace function public.pages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.url is distinct from old.url then
    new.url_normalized := public.normalize_url(new.url);
  end if;
  -- Une mise à jour qui fixe elle-même updated_at (réservation, tests) est respectée
  if tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger pages_before_write
before insert or update on public.pages
for each row execute function public.pages_before_write();

-- RLS ---------------------------------------------------------------------------

alter table public.pages enable row level security;

create policy pages_select_own on public.pages for select to authenticated using (owner_id = auth.uid());
create policy pages_insert_own on public.pages for insert to authenticated with check (owner_id = auth.uid());
create policy pages_update_own on public.pages for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pages_delete_own on public.pages for delete to authenticated using (owner_id = auth.uid());

-- Ajout depuis la page ----------------------------------------------------------

create or replace function public.add_page(p_url text)
returns table (id uuid, is_duplicate boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  insert into public.pages (url) values (p_url)
  on conflict (owner_id, url_normalized) do nothing
  returning pages.id into v_id;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  return query
    select p.id, true from public.pages p
    where p.owner_id = auth.uid() and p.url_normalized = public.normalize_url(p_url);
end;
$$;

-- Réservation par le robot ------------------------------------------------------

create or replace function public.claim_pending_pages(p_limit int default 20)
returns setof public.pages
language sql
security definer
set search_path = ''
as $$
  update public.pages
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id in (
    select id from public.pages
    where status = 'pending'
       or (status = 'processing' and updated_at < now() - interval '15 minutes')
    order by created_at
    for update skip locked
    limit p_limit
  )
  returning *;
$$;

revoke execute on function public.claim_pending_pages(int) from public, anon, authenticated;
grant execute on function public.claim_pending_pages(int) to service_role;

-- Déclenchement du robot --------------------------------------------------------
-- Secrets Vault attendus : github_repo (ex. mael3105/uiCollection), github_dispatch_token.
-- Sans eux (base locale, tests), rien n'est envoyé.

create or replace function public.pages_request_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repo text;
  v_token text;
begin
  select decrypted_secret into v_repo from vault.decrypted_secrets where name = 'github_repo';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'github_dispatch_token';
  if v_repo is null or v_token is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/' || v_repo || '/dispatches',
    body := jsonb_build_object('event_type', 'capture', 'client_payload', jsonb_build_object('id', new.id)),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'uiCollection'
    )
  );
  return new;
end;
$$;

create trigger pages_request_capture
after insert or update of status on public.pages
for each row when (new.status = 'pending')
execute function public.pages_request_capture();

-- Vignettes ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

create policy thumbnails_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'thumbnails'
  and exists (select 1 from public.pages p where p.id::text = split_part(name, '.', 1) and p.owner_id = auth.uid())
);

create policy thumbnails_delete_own on storage.objects for delete to authenticated
using (
  bucket_id = 'thumbnails'
  and exists (select 1 from public.pages p where p.id::text = split_part(name, '.', 1) and p.owner_id = auth.uid())
);

-- Temps réel --------------------------------------------------------------------

alter publication supabase_realtime add table public.pages;
