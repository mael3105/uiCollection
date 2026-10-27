begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.add_page('https://leadpages.com/pricing');

-- Fiche éditable par son propriétaire
update public.pages set display_name = 'Leadpages', site_type = 'SaaS', page_type = 'Pricing',
  styles = array['Tech', 'Authentique'], notes = 'Grille tarifaire claire';
select results_eq(
  $$select display_name, site_type, page_type, styles, notes from public.pages$$,
  $$values ('Leadpages', 'SaaS', 'Pricing', array['Tech', 'Authentique'], 'Grille tarifaire claire')$$,
  'le propriétaire édite sa fiche'
);
select is((select styles from public.pages), array['Tech', 'Authentique'], 'styles multiples');
select throws_ok($$update public.pages set display_name = repeat('x', 201)$$, '23514', null, 'nom affiché limité à 200 caractères');
select throws_ok($$update public.pages set notes = repeat('x', 10001)$$, '23514', null, 'notes limitées à 10 000 caractères');

-- Un autre utilisateur ne modifie rien
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
update public.pages set display_name = 'piraté';
reset role;
select is((select display_name from public.pages where owner_id = '11111111-1111-1111-1111-111111111111'), 'Leadpages', 'B ne modifie pas la fiche de A');

-- Le robot écrit l'analyse sans toucher aux corrections
set local role service_role;
update public.pages set analysis = '{"version":1,"colors":{"primary":"#0069ff"}}', site_name = 'leadpages.com' where owner_id = '11111111-1111-1111-1111-111111111111';
select is((select analysis->'colors'->>'primary' from public.pages where owner_id = '11111111-1111-1111-1111-111111111111'), '#0069ff', 'analyse enregistrée');
select is((select display_name from public.pages where owner_id = '11111111-1111-1111-1111-111111111111'), 'Leadpages', 'le nom corrigé survit à une recapture');
reset role;

select * from finish();
rollback;
