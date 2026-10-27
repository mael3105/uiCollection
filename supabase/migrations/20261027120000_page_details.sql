-- uiCollection v2 : analyse de design calculée par le robot, fiche éditable.

alter table public.pages
  -- Écrite par le robot à chaque capture (voir worker/src/analyze-page.js)
  add column analysis jsonb,
  -- Corrections de la personne : jamais écrasées par une recapture
  add column display_name text check (char_length(display_name) <= 200),
  add column site_type text check (char_length(site_type) <= 60),
  add column page_type text check (char_length(page_type) <= 60),
  add column styles text[] not null default '{}' check (cardinality(styles) <= 12),
  add column notes text check (char_length(notes) <= 10000);
