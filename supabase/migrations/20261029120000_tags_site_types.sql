-- Tags libres sur chaque page, et nouvelle liste de types de site.

create or replace function public.tags_valid(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(t) between 1 and 40), true) from unnest(tags) as t
$$;

alter table public.pages
  add column tags text[] not null default '{}'
    check (cardinality(tags) <= 30 and public.tags_valid(tags));

-- Types renommés dans la nouvelle liste (site/lib/taxonomy.js)
update public.pages set site_type = case site_type
    when 'Corporate' then 'Business & Corporate'
    when 'Média' then 'Média & Magazine'
    when 'Hospitality' then 'Hotel & Restaurant'
    when 'SaaS' then 'Startups / SaaS'
    when 'eCommerce' then 'E-Commerce'
    when 'Institution' then 'Institutions'
  end
where site_type in ('Corporate', 'Média', 'Hospitality', 'SaaS', 'eCommerce', 'Institution');
