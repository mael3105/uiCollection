-- uiCollection v2.1 : « Relancer l'analyse » sans refaire la vignette.
-- Le robot lit `job` sur chaque page en attente, puis le remet à 'capture'.

alter table public.pages
  add column job text not null default 'capture' check (job in ('capture', 'analysis'));
